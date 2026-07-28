import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { shiftReferenceMonth } from "./date";
import { deriveInvoiceState, type InvoiceState } from "./invoice";

type DB = SupabaseClient<Database>;

/**
 * Gasto por categoria (em centavos) num mês. Chave "none" = sem categoria.
 *
 * A soma é feita no Postgres (`spending_by_category`, migration 0018). Antes
 * eram duas idas ao banco — parcelas e depois transações — e o agrupamento em
 * JS sobre TODAS as linhas do mês, sujeito ao corte de `max-rows` do PostgREST.
 */
export async function spendingByCategory(db: DB, refMonth: string): Promise<Map<string, number>> {
  const { data, error } = await db.rpc("spending_by_category", { p_ref_month: refMonth });

  const map = new Map<string, number>();
  if (error || !data?.length) return map;

  for (const row of data) map.set(row.category_id ?? "none", row.cents);
  return map;
}

/**
 * Total gasto por mês nos últimos `count` meses (inclui o mês corrente).
 *
 * A agregação vem pronta do banco; meses sem parcela não voltam na resposta e
 * entram aqui como zero, preservando a série completa que o gráfico espera.
 */
export async function monthlyTotals(
  db: DB,
  currentMonth: string,
  count = 6,
): Promise<{ month: string; cents: number }[]> {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) months.push(shiftReferenceMonth(currentMonth, -i));

  const { data, error } = await db.rpc("monthly_totals", { p_months: months });

  const byMonth = new Map<string, number>((data ?? []).map((r) => [r.reference_month, r.cents]));
  if (error) byMonth.clear();
  return months.map((m) => ({ month: m, cents: byMonth.get(m) ?? 0 }));
}

// ── Fluxo de caixa do mês (regime de vencimento) ────────────────────────────
//
// Enquanto os relatórios acima somam por COMPETÊNCIA (mês em que a fatura fecha),
// o que vem abaixo raciocina por CAIXA: o que efetivamente entra e sai do bolso
// no mês do vencimento. É o que alimenta o topo da tela inicial.

/** Chave composta `${card_id}|${reference_month}` que identifica uma fatura. */
function invoiceKey(cardId: string, referenceMonth: string): string {
  return `${cardId}|${referenceMonth}`;
}

/**
 * Agrega o total (em centavos) de parcelas por fatura `(card_id, reference_month)`.
 * Função pura e testável — usada pela LISTA de cartões, cuja query traz o produto
 * cartesiano de `.in(card_id).in(reference_month)`; só as chaves realmente
 * existentes são lidas depois, então o excesso é inofensivo.
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

const EMPTY_FLOW: MonthCashFlow = {
  income: 0,
  invoicesDue: [],
  invoicesTotal: 0,
  cashSpending: 0,
  toPay: 0,
  leftover: 0,
};

/**
 * Agrega o fluxo de caixa do mês: entradas, faturas que vencem no mês e gastos à
 * vista. `toPay` soma TODAS as faturas do mês (inclusive as já pagas), pois o
 * dinheiro sai/saiu do mês — a distinção paga/a-pagar fica no estado de cada uma.
 *
 * Uma única ida ao banco (`month_cash_flow`, migration 0018): eram três consultas
 * em série, e a das faturas ainda encadeava faturas → parcelas → cartões.
 *
 * O ESTADO de cada fatura continua sendo decidido aqui, por `deriveInvoiceState`:
 * a RPC devolve só `status` e `closing_date`, e a comparação com o "hoje" do
 * timezone do usuário é regra de domínio, não de SQL (RN-08).
 */
export async function monthCashFlow(
  db: DB,
  month: string,
  today: string,
): Promise<MonthCashFlow> {
  const { data, error } = await db.rpc("month_cash_flow", { p_month: month });
  if (error || !data) return EMPTY_FLOW;

  const invoicesDue: InvoiceDue[] = data.invoices.map((inv) => ({
    id: inv.id,
    cardId: inv.card_id,
    cardName: inv.card_name ?? "Cartão",
    cardColor: inv.card_color ?? "#94a3b8",
    referenceMonth: inv.reference_month,
    dueDate: inv.due_date,
    closingDate: inv.closing_date,
    totalCents: inv.total_cents,
    state: deriveInvoiceState(inv.status, inv.closing_date, today),
  }));

  const income = data.income_cents;
  const cashSpending = data.cash_spending_cents;
  const invoicesTotal = invoicesDue.reduce((s, i) => s + i.totalCents, 0);
  const toPay = invoicesTotal + cashSpending;
  return { income, invoicesDue, invoicesTotal, cashSpending, toPay, leftover: income - toPay };
}
