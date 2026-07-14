import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { shiftReferenceMonth } from "./date";

type DB = SupabaseClient<Database>;

/** Gasto por categoria (em centavos) num mês. Chave "none" = sem categoria. */
export async function spendingByCategory(db: DB, refMonth: string): Promise<Map<string, number>> {
  const { data: inst } = await db
    .from("installments")
    .select("amount_cents, transaction_id")
    .eq("reference_month", refMonth);

  const map = new Map<string, number>();
  if (!inst?.length) return map;

  const txIds = [...new Set(inst.map((i) => i.transaction_id))];
  const { data: txs } = await db
    .from("transactions")
    .select("id, category_id")
    .in("id", txIds);
  const catByTx = new Map((txs ?? []).map((t) => [t.id, t.category_id]));

  for (const it of inst) {
    const cat = catByTx.get(it.transaction_id) ?? "none";
    map.set(cat, (map.get(cat) ?? 0) + it.amount_cents);
  }
  return map;
}

/** Total gasto por mês nos últimos `count` meses (inclui o mês corrente). */
export async function monthlyTotals(
  db: DB,
  currentMonth: string,
  count = 6,
): Promise<{ month: string; cents: number }[]> {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) months.push(shiftReferenceMonth(currentMonth, -i));

  const { data: inst } = await db
    .from("installments")
    .select("amount_cents, reference_month")
    .gte("reference_month", months[0])
    .lte("reference_month", months[months.length - 1]);

  const byMonth = new Map<string, number>(months.map((m) => [m, 0]));
  for (const it of inst ?? []) {
    if (byMonth.has(it.reference_month)) {
      byMonth.set(it.reference_month, (byMonth.get(it.reference_month) ?? 0) + it.amount_cents);
    }
  }
  return months.map((m) => ({ month: m, cents: byMonth.get(m) ?? 0 }));
}
