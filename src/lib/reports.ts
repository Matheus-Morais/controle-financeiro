import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { monthRange, shiftReferenceMonth } from "./date";
import { deriveInvoiceState, type InvoiceState } from "./invoice";

type DB = SupabaseClient<Database>;

/** Gasto por categoria (em centavos) num mês. Chave "none" = sem categoria. */
export async function spendingByCategory(db: DB, refMonth: string): Promise<Map<string, number>> {
  const { data: inst } = await db
    .from("installments")
    .select("amount_cents, transaction_id")
    .eq("reference_month", refMonth)
    .is("deleted_at", null);

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
    .lte("reference_month", months[months.length - 1])
    .is("deleted_at", null);

  const byMonth = new Map<string, number>(months.map((m) => [m, 0]));
  for (const it of inst ?? []) {
    if (byMonth.has(it.reference_month)) {
      byMonth.set(it.reference_month, (byMonth.get(it.reference_month) ?? 0) + it.amount_cents);
    }
  }
  return months.map((m) => ({ month: m, cents: byMonth.get(m) ?? 0 }));
}

// ── Fluxo de caixa do mês (regime de vencimento) ────────────────────────────
//
// Enquanto os relatórios acima somam por COMPETÊNCIA (mês em que a fatura fecha),
// as funções abaixo raciocinam por CAIXA: o que efetivamente entra e sai do
// bolso no mês do vencimento. É o que alimenta o topo da tela inicial.

/** Chave composta `${card_id}|${reference_month}` que identifica uma fatura. */
function invoiceKey(cardId: string, referenceMonth: string): string {
  return `${cardId}|${referenceMonth}`;
}

/**
 * Agrega o total (em centavos) de parcelas por fatura `(card_id, reference_month)`.
 * Função pura e testável — a query traz o produto cartesiano de
 * `.in(card_id).in(reference_month)`, mas só as chaves realmente existentes são
 * lidas depois, então o excesso é inofensivo.
 */
export function aggregateInstallmentTotals(
  rows: { card_id: string | null; reference_month: string; amount_cents: number }[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const it of rows) {
    if (it.card_id == null) continue;
    const key = invoiceKey(it.card_id, it.reference_month);
    totals.set(key, (totals.get(key) ?? 0) + it.amount_cents);
  }
  return totals;
}

/** Uma fatura que vence no mês consultado, já com total e estado derivado. */
export interface InvoiceDue {
  id: string;
  cardId: string;
  cardName: string;
  cardColor: string;
  /** Competência da fatura (`YYYY-MM-01`) — mês em que fecha. */
  referenceMonth: string;
  /** Vencimento (`YYYY-MM-DD`). */
  dueDate: string;
  /** Fechamento (`YYYY-MM-DD`). */
  closingDate: string;
  /** Total da fatura em centavos (soma das parcelas, exclui soft-deleted). */
  totalCents: number;
  state: InvoiceState;
}

/**
 * Faturas de cartão cujo VENCIMENTO cai no mês `month` (`YYYY-MM-01`), com o
 * total somado das parcelas e o estado (`paid`/`to_pay`/`forecast`) derivado de
 * `today`. `today` é `YYYY-MM-DD` no timezone do usuário (passado pela page).
 */
export async function invoicesDueInMonth(
  db: DB,
  month: string,
  today: string,
): Promise<InvoiceDue[]> {
  const { start, endExclusive } = monthRange(month);

  const { data: invoices } = await db
    .from("invoices")
    .select("id, card_id, reference_month, closing_date, due_date, status")
    .gte("due_date", start)
    .lt("due_date", endExclusive)
    .order("due_date");

  if (!invoices?.length) return [];

  const cardIds = [...new Set(invoices.map((i) => i.card_id))];
  const refMonths = [...new Set(invoices.map((i) => i.reference_month))];

  // Uma única query de parcelas para todas as faturas (evita N+1). O total de
  // CADA fatura usa a chave (card_id, reference_month) DELA — não o mês `month`,
  // já que o caso normal é reference_month = mês anterior ao vencimento.
  const { data: inst } = await db
    .from("installments")
    .select("card_id, reference_month, amount_cents")
    .in("card_id", cardIds)
    .in("reference_month", refMonths)
    .is("deleted_at", null);

  const totals = aggregateInstallmentTotals(inst ?? []);

  const { data: cards } = await db
    .from("cards")
    .select("id, name, color")
    .in("id", cardIds);
  const cardById = new Map((cards ?? []).map((c) => [c.id, c]));

  return invoices.map((inv) => {
    const card = cardById.get(inv.card_id);
    return {
      id: inv.id,
      cardId: inv.card_id,
      cardName: card?.name ?? "Cartão",
      cardColor: card?.color ?? "#94a3b8",
      referenceMonth: inv.reference_month,
      dueDate: inv.due_date,
      closingDate: inv.closing_date,
      totalCents: totals.get(invoiceKey(inv.card_id, inv.reference_month)) ?? 0,
      state: deriveInvoiceState(inv.status, inv.closing_date, today),
    };
  });
}

/**
 * Total (centavos) dos gastos à vista/débito/dinheiro do mês — parcelas SEM
 * cartão (`card_id IS NULL`) com competência `month`. Para esses, competência e
 * caixa coincidem (o pagamento é imediato).
 */
export async function cashSpendingInMonth(db: DB, month: string): Promise<number> {
  const { data } = await db
    .from("installments")
    .select("amount_cents")
    .eq("reference_month", month)
    .is("card_id", null)
    .is("deleted_at", null);
  return (data ?? []).reduce((s, i) => s + i.amount_cents, 0);
}

/** Total (centavos) de recebimentos do mês (`reference_month = month`). */
export async function monthlyIncome(db: DB, month: string): Promise<number> {
  const { data } = await db
    .from("incomes")
    .select("amount_cents")
    .eq("reference_month", month);
  return (data ?? []).reduce((s, i) => s + i.amount_cents, 0);
}

/** Fluxo de caixa consolidado de um mês (regime de vencimento). */
export interface MonthCashFlow {
  /** Entradas: recebimentos do mês. */
  income: number;
  /** Faturas de cartão que vencem no mês (com total e estado). */
  invoicesDue: InvoiceDue[];
  /** Soma dos totais das faturas que vencem no mês. */
  invoicesTotal: number;
  /** Gastos à vista/débito do mês. */
  cashSpending: number;
  /** A pagar no mês = faturas + à vista. */
  toPay: number;
  /** Sobra do mês = entradas − a pagar. */
  leftover: number;
}

/**
 * Agrega o fluxo de caixa do mês: entradas, faturas que vencem no mês e gastos à
 * vista. `toPay` soma TODAS as faturas do mês (inclusive as já pagas), pois o
 * dinheiro sai/saiu do mês — a distinção paga/a-pagar fica no estado de cada uma.
 */
export async function monthCashFlow(
  db: DB,
  month: string,
  today: string,
): Promise<MonthCashFlow> {
  const [income, invoicesDue, cashSpending] = await Promise.all([
    monthlyIncome(db, month),
    invoicesDueInMonth(db, month, today),
    cashSpendingInMonth(db, month),
  ]);
  const invoicesTotal = invoicesDue.reduce((s, i) => s + i.totalCents, 0);
  const toPay = invoicesTotal + cashSpending;
  return { income, invoicesDue, invoicesTotal, cashSpending, toPay, leftover: income - toPay };
}
