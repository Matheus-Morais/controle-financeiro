"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recurringSchema, parseSource } from "@/lib/schemas";
import { materializeRecurringExpenses } from "@/lib/recurring";
import { currentReferenceMonth } from "@/lib/date";

type ActionState = { error?: string } | undefined;

export async function createRecurring(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = recurringSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const r = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const source = parseSource(r.source);
  const { error } = await supabase.from("recurring_expenses").insert({
    user_id: user.id,
    card_id: source.kind === "card" ? source.id : null,
    account_id: source.kind === "account" ? source.id : null,
    category_id: r.category_id || null,
    description: r.description,
    amount_cents: r.amount_cents,
    billing_day: r.billing_day,
    start_month: `${r.start_month}-01`,
    active: true,
  });
  if (error) return { error: error.message };

  // Materializa o mês corrente para já aparecer nas faturas/dashboard.
  await materializeRecurringExpenses(supabase, user.id, currentReferenceMonth());

  revalidatePath("/recorrentes");
  revalidatePath("/", "layout");
  redirect("/recorrentes");
}

export async function toggleRecurringActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase.from("recurring_expenses").update({ active }).eq("id", id);
  revalidatePath("/recorrentes");
}

export async function deleteRecurring(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("recurring_expenses").delete().eq("id", id);
  revalidatePath("/recorrentes");
}

/**
 * Cria um RecurringExpense a partir de uma transação já salva.
 * O usuário informa o dia de cobrança e a partir de qual mês.
 * A transação original não é alterada.
 */
export async function criarRecorrenteDeTransacao(
  transactionId: string,
  billingDay: number,
  startMonth: string, // YYYY-MM
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: tx } = await supabase
    .from("transactions")
    .select("description, total_amount_cents, card_id, account_id, category_id")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .single();
  if (!tx) return { error: "Transação não encontrada." };
  if (!tx.card_id && !tx.account_id) return { error: "Transação sem cartão/conta associada." };

  if (billingDay < 1 || billingDay > 31) return { error: "Dia de cobrança inválido." };
  if (!/^\d{4}-\d{2}$/.test(startMonth)) return { error: "Mês de início inválido." };

  const { error } = await supabase.from("recurring_expenses").insert({
    user_id: user.id,
    card_id: tx.card_id,
    account_id: tx.account_id,
    category_id: tx.category_id,
    description: tx.description,
    amount_cents: tx.total_amount_cents,
    billing_day: billingDay,
    start_month: `${startMonth}-01`,
    active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/recorrentes");
  revalidatePath("/", "layout");
  return {};
}
