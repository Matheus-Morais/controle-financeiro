"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { expenseSchema, parseSource } from "@/lib/schemas";
import { generateInstallments } from "@/lib/installments";
import { ACCOUNT_CLOSING_DAY, invoiceRefForMonth, clampDay, toISO, ymd } from "@/lib/invoice";
import { assertOwned } from "@/lib/ownership";

type ActionState = { error?: string } | undefined;

/**
 * Edita um gasto (single/installment): atualiza a transação e regenera as
 * parcelas via `generateInstallments`. Toda a gravação acontece dentro de
 * `update_expense_atomic` — antes, o delete das parcelas antigas acontecia
 * FORA de qualquer transação: se o insert seguinte falhasse, o gasto ficava
 * sem nenhuma parcela e sumia das faturas e relatórios.
 *
 * A função do banco preserva, por competência, o `status` (paid) e o
 * `deleted_at` (soft-delete) das parcelas antigas, e devolve quantas
 * competências PAGAS deixaram de existir no novo cronograma — encurtar um
 * parcelamento apagava esse registro sem aviso.
 */
export async function updateExpense(
  id: string,
  month: string | undefined,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const e = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  // Transação existente (RLS já escopa por usuário).
  const { data: existing } = await supabase
    .from("transactions")
    .select("id, kind")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Gasto não encontrado." };
  if (existing.kind === "recurring") {
    return { error: "Gastos recorrentes são editados na tela de recorrentes." };
  }

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

  const categoryId = await assertOwned(supabase, "categories", e.category_id || null);
  if (e.category_id && !categoryId) return { error: "Categoria não encontrada." };

  const parcels = generateInstallments({
    totalAmountCents: e.amount_cents,
    count,
    purchaseDate: e.purchase_date,
    closingDay,
  });

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
    };
  });

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

  const { data: dropped, error } = await supabase.rpc("update_expense_atomic", {
    p_transaction_id: id,
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
    console.error("[gastos/editar] falha ao gravar:", error.code);
    return { error: "Não foi possível salvar a alteração. Tente novamente." };
  }

  revalidatePath("/", "layout");
  // O aviso viaja na URL: a edição já foi gravada, então não cabe devolver erro —
  // o destino mostra o banner de "N competência(s) paga(s) descartada(s)".
  const aviso = (dropped ?? 0) > 0 ? `pagas_descartadas=${dropped}` : "";
  const query = [month ? `mes=${month}` : "", aviso].filter(Boolean).join("&");
  redirect(
    source.kind === "card"
      ? `/cartoes/${source.id}${query ? `?${query}` : ""}`
      : `/contas${aviso ? `?${aviso}` : ""}`,
  );
}
