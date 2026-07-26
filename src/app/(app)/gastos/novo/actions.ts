"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { expenseSchema, parseSource } from "@/lib/schemas";
import { generateInstallments } from "@/lib/installments";
import { ACCOUNT_CLOSING_DAY, invoiceRefForMonth, clampDay, toISO, ymd } from "@/lib/invoice";
import { assertOwned } from "@/lib/ownership";

type ActionState = { error?: string } | undefined;

export async function createExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const e = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const source = parseSource(e.source);
  const count = e.kind === "single" ? 1 : e.installments_count;

  // Fechamento define a competência das parcelas.
  let closingDay = ACCOUNT_CLOSING_DAY;
  let dueDay = ACCOUNT_CLOSING_DAY;
  if (source.kind === "card") {
    const { data: card } = await supabase
      .from("cards")
      .select("closing_day, due_day")
      .eq("id", source.id)
      .single();
    if (!card) return { error: "Cartão não encontrado." };
    closingDay = card.closing_day;
    dueDay = card.due_day;
  } else if (!(await assertOwned(supabase, "accounts", source.id))) {
    return { error: "Conta não encontrada." };
  }

  // A categoria vem do formulário e a RLS não valida o dono do alvo da FK.
  const categoryId = await assertOwned(supabase, "categories", e.category_id || null);
  if (e.category_id && !categoryId) return { error: "Categoria não encontrada." };

  const parcels = generateInstallments({
    totalAmountCents: e.amount_cents,
    count,
    purchaseDate: e.purchase_date,
    closingDay,
  });

  // Parcelas. Contas (origem conta) guardam o vencimento (due_date) no dia da
  // compra, ajustado ao mês de cada parcela; cartões usam invoices.
  const purchaseDay = ymd(e.purchase_date)[2];
  const installments = parcels.map((p) => {
    const [py, pm0] = ymd(p.referenceMonth);
    return {
      card_id: source.kind === "card" ? source.id : null,
      account_id: source.kind === "account" ? source.id : null,
      number: p.number,
      amount_cents: p.amountCents,
      reference_month: p.referenceMonth,
      due_date: source.kind === "account" ? toISO(py, pm0, clampDay(purchaseDay, py, pm0)) : null,
      status: "open" as const,
    };
  });

  // Faturas por competência (só cartões; o `on conflict do nothing` da função
  // garante que uma fatura já paga nunca é reaberta).
  const invoices =
    source.kind === "card"
      ? [...new Set(parcels.map((p) => p.referenceMonth))].map((m) => {
          const [y, m0] = ymd(m);
          const ref = invoiceRefForMonth(y, m0, { closingDay, dueDay });
          return {
            card_id: source.id,
            reference_month: ref.referenceMonth,
            closing_date: ref.closingDate,
            due_date: ref.dueDate,
          };
        })
      : [];

  // Uma única transação no banco: sem ela, uma falha entre os inserts deixaria
  // a transação órfã (sem parcelas), invisível em faturas e relatórios.
  const { error } = await supabase.rpc("create_expense_atomic", {
    p_transaction: {
      card_id: source.kind === "card" ? source.id : null,
      account_id: source.kind === "account" ? source.id : null,
      category_id: categoryId,
      description: e.description,
      kind: e.kind,
      total_amount_cents: e.amount_cents,
      purchase_date: e.purchase_date,
      installments_count: count,
      notes: e.notes || null,
    },
    p_installments: installments,
    p_invoices: invoices,
  });
  if (error) {
    console.error("[gastos/novo] falha ao gravar:", error.code);
    return { error: "Não foi possível salvar o gasto. Tente novamente." };
  }

  revalidatePath("/", "layout");
  redirect(source.kind === "card" ? `/cartoes/${source.id}` : "/contas");
}
