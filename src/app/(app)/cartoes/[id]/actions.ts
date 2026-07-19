"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { shiftReferenceMonth } from "@/lib/date";

type ActionState = { error?: string } | void;

const MONTH_RE = /^\d{4}-\d{2}-01$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export interface DeleteInstallmentInput {
  transactionId: string;
  cardId: string;
  /** Competência exibida na tela (`YYYY-MM-01`). Base do escopo. */
  fromMonth: string;
  /** "month" = só esta competência; "forward" = desta em diante. */
  scope: "month" | "forward";
}

/**
 * Exclui (soft-delete) parcelas de um gasto no cartão. Marca `deleted_at` em vez
 * de apagar: a parcela some do total, mas continua visível (esmaecida). NUNCA
 * toca competências anteriores a `fromMonth` — histórico é preservado.
 *
 * - scope "month": só a parcela desta competência.
 * - scope "forward": esta competência e todas as seguintes deste gasto.
 *
 * Para gastos recorrentes, "forward" também desativa o template (o cron para de
 * materializar) e marca as ocorrências futuras já materializadas.
 */
export async function softDeleteInstallments(input: DeleteInstallmentInput): Promise<ActionState> {
  const { transactionId, cardId, fromMonth, scope } = input;
  if (!UUID_RE.test(transactionId) || !UUID_RE.test(cardId) || !MONTH_RE.test(fromMonth)) {
    return { error: "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: tx } = await supabase
    .from("transactions")
    .select("id, kind, recurring_id")
    .eq("id", transactionId)
    .single();
  if (!tx) return { error: "Gasto não encontrado." };

  const now = new Date().toISOString();

  // Parcelas deste gasto, a partir da competência escolhida (nunca anteriores).
  {
    let q = supabase
      .from("installments")
      .update({ deleted_at: now })
      .eq("transaction_id", transactionId)
      .is("deleted_at", null);
    q = scope === "forward" ? q.gte("reference_month", fromMonth) : q.eq("reference_month", fromMonth);
    const { error } = await q;
    if (error) return { error: error.message };
  }

  // Recorrente + "forward": encerra o template e marca ocorrências futuras.
  if (scope === "forward" && tx.kind === "recurring" && tx.recurring_id) {
    const recurringId = tx.recurring_id;

    await supabase
      .from("recurring_expenses")
      .update({ active: false, end_month: shiftReferenceMonth(fromMonth, -1) })
      .eq("id", recurringId);

    const { data: siblings } = await supabase
      .from("transactions")
      .select("id")
      .eq("recurring_id", recurringId);
    const siblingIds = (siblings ?? []).map((s) => s.id);
    if (siblingIds.length) {
      await supabase
        .from("installments")
        .update({ deleted_at: now })
        .in("transaction_id", siblingIds)
        .gte("reference_month", fromMonth)
        .is("deleted_at", null);
    }
  }

  revalidatePath("/", "layout");
}

/**
 * Restaura (undo do soft-delete) a parcela de um gasto numa competência. Reverte
 * só o mês clicado — se a exclusão foi "em diante", cada mês é restaurado à parte.
 */
export async function restoreInstallment(input: {
  transactionId: string;
  month: string;
}): Promise<ActionState> {
  const { transactionId, month } = input;
  if (!UUID_RE.test(transactionId) || !MONTH_RE.test(month)) {
    return { error: "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase
    .from("installments")
    .update({ deleted_at: null })
    .eq("transaction_id", transactionId)
    .eq("reference_month", month);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
}
