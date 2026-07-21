import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { shiftReferenceMonth } from "./date";

type DB = SupabaseClient<Database>;

/**
 * Parte PURA da resolução da fatura em aberto: a partir de `currentMonth`
 * (`YYYY-MM-01`), avança enquanto o mês estiver em `paidMonths` (competências já
 * quitadas) e devolve o primeiro mês NÃO pago. Um mês sem fatura simplesmente não
 * está no conjunto — é onde a progressão para. `maxAhead` é uma trava de segurança.
 */
export function nextOpenMonth(
  currentMonth: string,
  paidMonths: Set<string>,
  maxAhead = 12,
): string {
  let month = currentMonth;
  for (let i = 0; i < maxAhead && paidMonths.has(month); i++) {
    month = shiftReferenceMonth(month, 1);
  }
  return month;
}

/**
 * Para cada cartão, resolve o mês (`YYYY-MM-01`) da PRÓXIMA fatura em aberto: o
 * primeiro mês >= `currentMonth` cuja fatura não está paga. Lê apenas faturas
 * pagas a partir do mês corrente (escopo RLS via client do usuário) e aplica
 * {@link nextOpenMonth} por cartão. Cartões sem fatura paga caem em `currentMonth`.
 */
export async function resolveOpenMonths(
  db: DB,
  cardIds: string[],
  currentMonth: string,
  maxAhead = 12,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!cardIds.length) return result;

  const { data: paid } = await db
    .from("invoices")
    .select("card_id, reference_month")
    .in("card_id", cardIds)
    .eq("status", "paid")
    .gte("reference_month", currentMonth);

  const paidByCard = new Map<string, Set<string>>();
  for (const inv of paid ?? []) {
    let set = paidByCard.get(inv.card_id);
    if (!set) {
      set = new Set<string>();
      paidByCard.set(inv.card_id, set);
    }
    set.add(inv.reference_month);
  }

  for (const id of cardIds) {
    result.set(id, nextOpenMonth(currentMonth, paidByCard.get(id) ?? new Set(), maxAhead));
  }
  return result;
}
