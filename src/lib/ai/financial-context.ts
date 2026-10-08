/**
 * Construtor e higienizador do contexto financeiro do usuário para o LLM.
 *
 * Garante RLS (usa o client de usuário recebido), formata valores em centavos e
 * suprime PII (sem números de cartão, tokens ou IDs internos de banco).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatMonthLabel, todayISO } from "@/lib/date";
import { monthCashFlow, spendingByCategory } from "@/lib/reports";
import type { FinancialSanitizedContext } from "./types";

type DB = SupabaseClient<Database>;

export async function buildFinancialContext(
  db: DB,
  refMonth: string,
  tz: string,
): Promise<FinancialSanitizedContext> {
  const today = todayISO(tz);
  const monthLabel = formatMonthLabel(refMonth);

  // Consultas principais em paralelo
  const [flow, spending, { data: categories }, { data: budgets }, { data: recurring }] =
    await Promise.all([
      monthCashFlow(db, refMonth, today),
      spendingByCategory(db, refMonth),
      db.from("categories").select("id, name").order("name"),
      db.from("budgets").select("category_id, limit_cents").is("reference_month", null),
      db
        .from("recurring_expenses")
        .select("description, amount_cents, billing_day")
        .eq("active", true)
        .order("amount_cents", { ascending: false }),
    ]);

  const catById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const limitByCat = new Map((budgets ?? []).map((b) => [b.category_id, b.limit_cents]));

  // Categorias com gastos ou com limite configurado
  const categorySpendings: FinancialSanitizedContext["categorySpendings"] = [];
  for (const cat of categories ?? []) {
    const spentCents = spending.get(cat.id) ?? 0;
    const limitCents = limitByCat.get(cat.id);
    if (spentCents > 0 || limitCents != null) {
      categorySpendings.push({
        name: cat.name,
        spentCents,
        limitCents: limitCents ?? undefined,
      });
    }
  }

  const uncategorizedSpent = spending.get("none") ?? 0;
  if (uncategorizedSpent > 0) {
    categorySpendings.push({
      name: "Sem categoria",
      spentCents: uncategorizedSpent,
    });
  }

  // Ordena por maior gasto primeiro
  categorySpendings.sort((a, b) => b.spentCents - a.spentCents);

  // Busca maiores lançamentos do mês em 2 etapas (seguindo convenção do projeto sem joins postgrest)
  const { data: topInstallments } = await db
    .from("installments")
    .select("transaction_id, amount_cents")
    .is("deleted_at", null)
    .eq("reference_month", refMonth)
    .order("amount_cents", { ascending: false })
    .limit(15);

  const topExpenses: FinancialSanitizedContext["topExpenses"] = [];
  if (topInstallments && topInstallments.length > 0) {
    const txIds = [...new Set(topInstallments.map((i) => i.transaction_id))];
    const { data: txs } = await db
      .from("transactions")
      .select("id, description, purchase_date, category_id")
      .in("id", txIds);

    const txMap = new Map((txs ?? []).map((t) => [t.id, t]));

    for (const inst of topInstallments) {
      const tx = txMap.get(inst.transaction_id);
      if (!tx) continue;
      topExpenses.push({
        description: tx.description,
        amountCents: inst.amount_cents,
        date: tx.purchase_date,
        categoryName: tx.category_id ? catById.get(tx.category_id) : undefined,
      });
    }
  }

  // Faturas do mês
  const invoices = flow.invoicesDue.map((inv) => ({
    cardName: inv.cardName,
    amountCents: inv.totalCents,
    dueDate: inv.dueDate,
    state: inv.state === "paid" ? "Paga" : inv.state === "to_pay" ? "A pagar" : "Prevista",
  }));

  // Recorrentes
  const recurringExpenses = (recurring ?? []).map((r) => ({
    description: r.description,
    amountCents: r.amount_cents,
    day: r.billing_day,
  }));

  return {
    referenceMonth: refMonth,
    monthLabel,
    incomeTotalCents: flow.income,
    toPayTotalCents: flow.toPay,
    leftoverCents: flow.leftover,
    invoices,
    categorySpendings,
    topExpenses,
    recurringExpenses,
  };
}
