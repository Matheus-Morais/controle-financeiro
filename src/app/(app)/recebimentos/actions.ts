"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { incomeSchema } from "@/lib/schemas";
import { toISO, ymd } from "@/lib/invoice";
import { nthBusinessDay } from "@/lib/business-days";

type ActionState = { error?: string } | undefined;
type ActionResult = { error?: string };

export async function createIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = incomeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const i = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const [y, m0] = ymd(i.receipt_date);
  const referenceMonth = toISO(y, m0, 1);

  const businessDayMode = i.is_recurring && i.recurring_mode === "nth_business_day";
  // No modo "dia útil", a data de recebimento é o N-ésimo dia útil do próprio mês.
  const receiptDate = businessDayMode
    ? toISO(y, m0, nthBusinessDay(y, m0, i.recurring_business_day ?? 5))
    : i.receipt_date;

  const { error } = await supabase.from("incomes").insert({
    user_id: user.id,
    description: i.description,
    amount_cents: i.amount_cents,
    receipt_date: receiptDate,
    reference_month: referenceMonth,
    is_recurring: i.is_recurring,
    recurring_mode: i.is_recurring ? i.recurring_mode : "day_of_month",
    recurring_day:
      i.is_recurring && i.recurring_mode === "day_of_month"
        ? (i.recurring_day ?? Number(i.receipt_date.slice(8, 10)))
        : null,
    recurring_business_day: businessDayMode ? (i.recurring_business_day ?? 5) : null,
  });
  if (error) return { error: error.message };

  revalidatePath("/recebimentos");
  revalidatePath("/");
  redirect(`/recebimentos?mes=${referenceMonth}`);
}

export async function deleteIncome(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.from("incomes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/recebimentos");
  revalidatePath("/");
  return {};
}

/**
 * Encerra a repetição de uma renda recorrente a partir da competência dela.
 *
 * Antes, a única forma de parar era apagar o recebimento do mês — pouco
 * descobrível e frágil (a materialização copia do mês anterior, então o mês
 * seguinte voltava a recriá-lo). `recurring_end_month` marca a última
 * competência em que a renda ainda se repete; o registro do mês permanece.
 */
export async function endIncomeRecurrence(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: income } = await supabase
    .from("incomes")
    .select("reference_month")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!income) return { error: "Recebimento não encontrado." };

  const { error } = await supabase
    .from("incomes")
    .update({ recurring_end_month: income.reference_month })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/recebimentos");
  revalidatePath("/");
  return {};
}
