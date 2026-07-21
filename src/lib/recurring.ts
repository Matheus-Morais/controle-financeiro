import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { generateInstallments } from "./installments";
import { invoiceRefForMonth, clampDay, toISO, ymd } from "./invoice";
import { nthBusinessDay } from "./business-days";
import { shiftReferenceMonth } from "./date";

type DB = SupabaseClient<Database>;

const ACCOUNT_CLOSING_DAY = 31;

/**
 * Materializa (idempotentemente) os gastos recorrentes ativos de um usuário no
 * mês `refMonth` (`YYYY-MM-01`): cria a transação + parcela única + fatura.
 * Chamado na criação (mês corrente) e no cron do dia 1 (novo mês).
 */
export async function materializeRecurringExpenses(db: DB, userId: string, refMonth: string) {
  const nextMonth = shiftReferenceMonth(refMonth, 1);

  const { data: recurrings } = await db
    .from("recurring_expenses")
    .select("id, card_id, account_id, category_id, description, amount_cents, billing_day")
    .eq("user_id", userId)
    .eq("active", true)
    .lte("start_month", refMonth)
    .or(`end_month.is.null,end_month.gte.${refMonth}`);

  if (!recurrings?.length) return 0;

  // Cartões referenciados, para o dia de fechamento.
  const cardIds = [...new Set(recurrings.map((r) => r.card_id).filter(Boolean))] as string[];
  const { data: cards } = cardIds.length
    ? await db.from("cards").select("id, closing_day, due_day").in("id", cardIds)
    : { data: [] };
  const cardById = new Map((cards ?? []).map((c) => [c.id, c]));

  let created = 0;
  for (const r of recurrings) {
    // Idempotência: já materializado neste mês?
    const { count } = await db
      .from("transactions")
      .select("id", { head: true, count: "exact" })
      .eq("recurring_id", r.id)
      .gte("purchase_date", refMonth)
      .lt("purchase_date", nextMonth);
    if ((count ?? 0) > 0) continue;

    const [ry, rm0] = ymd(refMonth);
    const purchaseDate = toISO(ry, rm0, clampDay(r.billing_day, ry, rm0));

    const card = r.card_id ? cardById.get(r.card_id) : null;
    const closingDay = card?.closing_day ?? ACCOUNT_CLOSING_DAY;
    const dueDay = card?.due_day ?? ACCOUNT_CLOSING_DAY;

    const [parcel] = generateInstallments({
      totalAmountCents: r.amount_cents,
      count: 1,
      purchaseDate,
      closingDay,
    });

    const { data: tx } = await db
      .from("transactions")
      .insert({
        user_id: userId,
        card_id: r.card_id,
        account_id: r.account_id,
        category_id: r.category_id,
        recurring_id: r.id,
        description: r.description,
        kind: "recurring",
        total_amount_cents: r.amount_cents,
        purchase_date: purchaseDate,
        installments_count: 1,
      })
      .select("id")
      .single();
    if (!tx) continue;

    await db.from("installments").insert({
      user_id: userId,
      transaction_id: tx.id,
      card_id: r.card_id,
      account_id: r.account_id,
      number: 1,
      amount_cents: parcel.amountCents,
      reference_month: parcel.referenceMonth,
      // Contas fixas (origem conta) guardam o vencimento; cartões usam invoices.
      due_date: r.account_id && !r.card_id ? purchaseDate : null,
      status: "open",
    });

    if (r.card_id) {
      const [py, pm0] = ymd(parcel.referenceMonth);
      const ref = invoiceRefForMonth(py, pm0, { closingDay, dueDay });
      await db.from("invoices").upsert(
        {
          user_id: userId,
          card_id: r.card_id,
          reference_month: ref.referenceMonth,
          closing_date: ref.closingDate,
          due_date: ref.dueDate,
          status: "open",
        },
        { onConflict: "card_id,reference_month", ignoreDuplicates: true },
      );
    }
    created++;
  }
  return created;
}

/**
 * Materializa recebimentos recorrentes por "copiar do mês anterior": para cada
 * recebimento marcado como recorrente em `refMonth-1`, cria o equivalente em
 * `refMonth` se ainda não existir.
 */
export async function materializeRecurringIncomes(db: DB, userId: string, refMonth: string) {
  const prevMonth = shiftReferenceMonth(refMonth, -1);

  const { data: prev } = await db
    .from("incomes")
    .select("description, amount_cents, recurring_day, recurring_mode, recurring_business_day")
    .eq("user_id", userId)
    .eq("is_recurring", true)
    .eq("reference_month", prevMonth);

  if (!prev?.length) return 0;

  let created = 0;
  const [ry, rm0] = ymd(refMonth);
  for (const inc of prev) {
    const { count } = await db
      .from("incomes")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("reference_month", refMonth)
      .eq("description", inc.description);
    if ((count ?? 0) > 0) continue;

    const day =
      inc.recurring_mode === "nth_business_day"
        ? nthBusinessDay(ry, rm0, inc.recurring_business_day ?? 5)
        : clampDay(inc.recurring_day ?? 1, ry, rm0);
    await db.from("incomes").insert({
      user_id: userId,
      description: inc.description,
      amount_cents: inc.amount_cents,
      receipt_date: toISO(ry, rm0, day),
      reference_month: refMonth,
      is_recurring: true,
      recurring_mode: inc.recurring_mode,
      recurring_day: inc.recurring_day,
      recurring_business_day: inc.recurring_business_day,
    });
    created++;
  }
  return created;
}
