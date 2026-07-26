import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { ACCOUNT_CLOSING_DAY, invoiceRefForMonth, clampDay, toISO, ymd } from "./invoice";
import { nthBusinessDay } from "./business-days";
import { shiftReferenceMonth } from "./date";

type DB = SupabaseClient<Database>;

/**
 * Quais destas assinaturas já têm ocorrência lançada na competência. Duas idas ao
 * banco no total (em vez de uma por assinatura): as transações das assinaturas e
 * as parcelas dessas transações na competência.
 *
 * Parcela com soft-delete CONTA como lançada — o usuário excluiu a ocorrência do
 * mês de propósito; recriá-la no próximo tick seria ressuscitar o que ele apagou.
 */
async function materializedRecurringIds(
  db: DB,
  recurringIds: string[],
  refMonth: string,
): Promise<Set<string>> {
  if (!recurringIds.length) return new Set();

  const { data: txs } = await db
    .from("transactions")
    .select("id, recurring_id")
    .in("recurring_id", recurringIds);
  if (!txs?.length) return new Set();

  const recurringByTx = new Map(txs.map((t) => [t.id, t.recurring_id]));
  const { data: insts } = await db
    .from("installments")
    .select("transaction_id")
    .eq("reference_month", refMonth)
    .in(
      "transaction_id",
      txs.map((t) => t.id),
    );

  const ids = new Set<string>();
  for (const i of insts ?? []) {
    const recId = recurringByTx.get(i.transaction_id);
    if (recId) ids.add(recId);
  }
  return ids;
}

/**
 * Materializa (idempotentemente) os gastos recorrentes ativos de um usuário no
 * mês `refMonth` (`YYYY-MM-01`): cria a transação + parcela única + fatura.
 * Chamado na criação (mês corrente) e no cron do dia 1 (novo mês).
 */
export async function materializeRecurringExpenses(db: DB, userId: string, refMonth: string) {
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

  // Idempotência POR COMPETÊNCIA: uma assinatura já está lançada no mês quando
  // tem parcela em `refMonth` — não quando tem transação com `purchase_date` no
  // mês. A diferença importa para as ocorrências vindas de importação de fatura,
  // cuja data de compra é a impressa no PDF e pode cair no mês anterior.
  const materialized = await materializedRecurringIds(
    db,
    recurrings.map((r) => r.id),
    refMonth,
  );

  let created = 0;
  for (const r of recurrings) {
    if (materialized.has(r.id)) continue;

    const [ry, rm0] = ymd(refMonth);
    const purchaseDate = toISO(ry, rm0, clampDay(r.billing_day, ry, rm0));

    const card = r.card_id ? cardById.get(r.card_id) : null;
    const closingDay = card?.closing_day ?? ACCOUNT_CLOSING_DAY;
    const dueDay = card?.due_day ?? ACCOUNT_CLOSING_DAY;

    // Competência do recorrente = o próprio mês materializado. Diferente de uma
    // compra avulsa, o recorrente NÃO é empurrado para a fatura seguinte quando o
    // billing_day cai depois do fechamento: ele sempre entra na fatura do mês.
    // O billing_day é só a data de referência da cobrança (purchase_date).
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
      amount_cents: r.amount_cents,
      reference_month: refMonth,
      // Contas fixas (origem conta) guardam o vencimento; cartões usam invoices.
      due_date: r.account_id && !r.card_id ? purchaseDate : null,
      status: "open",
    });

    if (r.card_id) {
      const ref = invoiceRefForMonth(ry, rm0, { closingDay, dueDay });
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
 * Chave de deduplicação de uma renda no mês.
 *
 * Só a `description` não basta: duas rendas com o mesmo nome na mesma
 * competência (ex.: dois "Freela") colidiam e uma era descartada para sempre.
 * Valor e modo de recorrência entram na chave para distingui-las.
 */
function incomeKey(i: { description: string; amount_cents: number; recurring_mode: string | null }) {
  return `${i.description}|${i.amount_cents}|${i.recurring_mode ?? "day_of_month"}`;
}

/**
 * Materializa recebimentos recorrentes por "copiar do mês anterior": para cada
 * recebimento marcado como recorrente em `refMonth-1`, cria o equivalente em
 * `refMonth` se ainda não existir.
 *
 * Recorrências encerradas (`recurring_end_month` anterior a `refMonth`) não são
 * copiadas. Três idas ao banco no total — antes era uma consulta por
 * recebimento dentro do laço.
 */
export async function materializeRecurringIncomes(db: DB, userId: string, refMonth: string) {
  const prevMonth = shiftReferenceMonth(refMonth, -1);

  const { data: prev } = await db
    .from("incomes")
    .select(
      "description, amount_cents, recurring_day, recurring_mode, recurring_business_day, recurring_end_month",
    )
    .eq("user_id", userId)
    .eq("is_recurring", true)
    .eq("reference_month", prevMonth)
    .or(`recurring_end_month.is.null,recurring_end_month.gte.${refMonth}`);

  if (!prev?.length) return 0;

  // Uma única leitura do mês de destino (era uma por recebimento).
  const { data: current } = await db
    .from("incomes")
    .select("description, amount_cents, recurring_mode")
    .eq("user_id", userId)
    .eq("reference_month", refMonth);
  const existing = new Set((current ?? []).map(incomeKey));

  const [ry, rm0] = ymd(refMonth);
  const rows = [];
  for (const inc of prev) {
    const key = incomeKey(inc);
    // Duas rendas idênticas no mês anterior geram uma só aqui — o `existing`
    // acumula as chaves já enfileiradas para não duplicar dentro do próprio lote.
    if (existing.has(key)) continue;
    existing.add(key);

    const day =
      inc.recurring_mode === "nth_business_day"
        ? nthBusinessDay(ry, rm0, inc.recurring_business_day ?? 5)
        : clampDay(inc.recurring_day ?? 1, ry, rm0);
    rows.push({
      user_id: userId,
      description: inc.description,
      amount_cents: inc.amount_cents,
      receipt_date: toISO(ry, rm0, day),
      reference_month: refMonth,
      is_recurring: true,
      recurring_mode: inc.recurring_mode,
      recurring_day: inc.recurring_day,
      recurring_business_day: inc.recurring_business_day,
      // A data de encerramento acompanha a cópia, senão a recorrência
      // "reviveria" no mês seguinte.
      recurring_end_month: inc.recurring_end_month,
    });
  }

  if (!rows.length) return 0;
  const { error } = await db.from("incomes").insert(rows);
  if (error) return 0;
  return rows.length;
}
