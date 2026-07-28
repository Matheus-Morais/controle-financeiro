import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { ACCOUNT_CLOSING_DAY, invoiceRefForMonth, clampDay, toISO, ymd } from "./invoice";
import { nthBusinessDay } from "./business-days";
import { shiftReferenceMonth } from "./date";

type DB = SupabaseClient<Database>;

// `type` (não `interface`) de propósito: só type aliases de objeto ganham index
// signature implícita, e sem ela não são atribuíveis a `Json` — o formato do
// payload da RPC atômica. Mesmo motivo das linhas em `invoice-import.ts`.
type MaterializedTransaction = {
  id: string;
  card_id: string | null;
  account_id: string | null;
  category_id: string | null;
  recurring_id: string;
  description: string;
  kind: "recurring";
  total_amount_cents: number;
  purchase_date: string;
  installments_count: number;
};

type MaterializedInstallment = {
  transaction_id: string;
  card_id: string | null;
  account_id: string | null;
  number: number;
  amount_cents: number;
  reference_month: string;
  due_date: string | null;
  status: "open";
};

type MaterializedInvoice = {
  card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
};

/**
 * Materializa (idempotentemente) os gastos recorrentes ativos de um usuário nas
 * competências `refMonths` (`YYYY-MM-01`): cria transação + parcela única +
 * capa de fatura. Chamado no render das telas que mostram um mês, na criação da
 * assinatura e no cron do dia 1.
 *
 * DUAS idas ao banco no total, independentemente de quantos meses e assinaturas:
 *
 *  1. `pending_recurring_expenses` devolve só o que falta materializar, já com o
 *     ciclo do cartão. Antes eram quatro selects em série POR MÊS
 *     (`recurring_expenses → cards → transactions → installments`), pagos mesmo
 *     quando não havia nada a fazer — e as telas chamam isto para dois meses.
 *  2. `materialize_recurring_atomic` grava o lote inteiro numa transação do
 *     Postgres, e só é chamada quando há algo a gravar (o caso comum é não ter).
 *
 * As DATAS continuam sendo calculadas aqui, por `lib/invoice.ts` puro e testado:
 * a RPC filtra e junta, não decide competência (ver a migration 0017).
 *
 * A idempotência é POR COMPETÊNCIA (RN-24): uma assinatura já está lançada no mês
 * quando tem parcela em `refMonth` — não quando tem transação com `purchase_date`
 * no mês. A diferença importa para as ocorrências vindas de importação de fatura,
 * cuja data de compra é a impressa no PDF e pode cair no mês anterior.
 */
export async function materializeRecurringMonths(
  db: DB,
  userId: string,
  refMonths: string[],
): Promise<number> {
  const months = [...new Set(refMonths)];
  if (!months.length) return 0;

  const { data: pending, error: readError } = await db.rpc("pending_recurring_expenses", {
    p_user_id: userId,
    p_ref_months: months,
  });
  if (readError) {
    console.error("[recurring] falha ao ler pendentes:", readError.code);
    return 0;
  }
  if (!pending?.length) return 0;

  const transactions: MaterializedTransaction[] = [];
  const installments: MaterializedInstallment[] = [];
  const invoices: MaterializedInvoice[] = [];
  // Capas já enfileiradas, por (cartão, competência) — agora o lote pode cobrir
  // mais de um mês, então o cartão sozinho não identifica mais a fatura.
  const invoiceKeys = new Set<string>();

  for (const r of pending) {
    const refMonth = r.reference_month;
    const [ry, rm0] = ymd(refMonth);
    const purchaseDate = toISO(ry, rm0, clampDay(r.billing_day, ry, rm0));
    // Assinatura sem cartão (conta fixa) não tem ciclo: o fechamento fictício do
    // dia 31 faz a competência coincidir com o mês da cobrança.
    const closingDay = r.closing_day ?? ACCOUNT_CLOSING_DAY;
    const dueDay = r.due_day ?? ACCOUNT_CLOSING_DAY;

    // Id pré-gerado: liga parcela↔transação dentro do lote, sem round-trip.
    const txId = randomUUID();

    // Competência do recorrente = o próprio mês materializado. Diferente de uma
    // compra avulsa, o recorrente NÃO é empurrado para a fatura seguinte quando o
    // billing_day cai depois do fechamento: ele sempre entra na fatura do mês.
    // O billing_day é só a data de referência da cobrança (purchase_date).
    transactions.push({
      id: txId,
      card_id: r.card_id,
      account_id: r.account_id,
      category_id: r.category_id,
      recurring_id: r.recurring_id,
      description: r.description,
      kind: "recurring",
      total_amount_cents: r.amount_cents,
      purchase_date: purchaseDate,
      installments_count: 1,
    });

    installments.push({
      transaction_id: txId,
      card_id: r.card_id,
      account_id: r.account_id,
      number: 1,
      amount_cents: r.amount_cents,
      reference_month: refMonth,
      // Contas fixas (origem conta) guardam o vencimento; cartões usam invoices.
      due_date: r.account_id && !r.card_id ? purchaseDate : null,
      status: "open",
    });

    // Uma capa por (cartão, competência): várias assinaturas do mesmo cartão
    // dividem a mesma fatura. O `on conflict do nothing` da função absorveria a
    // repetição, mas não faz sentido mandá-la.
    const invoiceKey = `${r.card_id}|${refMonth}`;
    if (r.card_id && !invoiceKeys.has(invoiceKey)) {
      invoiceKeys.add(invoiceKey);
      const ref = invoiceRefForMonth(ry, rm0, { closingDay, dueDay });
      invoices.push({
        card_id: r.card_id,
        reference_month: ref.referenceMonth,
        closing_date: ref.closingDate,
        due_date: ref.dueDate,
      });
    }
  }

  const { error } = await db.rpc("materialize_recurring_atomic", {
    p_user_id: userId,
    p_transactions: transactions,
    p_installments: installments,
    p_invoices: invoices,
  });
  if (error) {
    console.error("[recurring] falha ao materializar:", error.code);
    return 0;
  }
  return transactions.length;
}

/** Açúcar de um mês só — o caso do cron e das actions de assinatura. */
export async function materializeRecurringExpenses(db: DB, userId: string, refMonth: string) {
  return materializeRecurringMonths(db, userId, [refMonth]);
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
