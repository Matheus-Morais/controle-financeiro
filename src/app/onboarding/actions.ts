"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cardSchema, incomeSchema } from "@/lib/schemas";
import { toISO, ymd } from "@/lib/invoice";
import { nthBusinessDay } from "@/lib/business-days";

type CardActionState =
  | { error?: string; card?: { id: string; name: string; color: string | null } }
  | undefined;

/** Cadastra um cartão durante o onboarding. Não redireciona — o wizard controla a navegação. */
export async function createOnboardingCard(
  _prev: CardActionState,
  formData: FormData,
): Promise<CardActionState> {
  const parsed = cardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const c = parsed.data;
  const { data, error } = await supabase
    .from("cards")
    .insert({
      user_id: user.id,
      name: c.name,
      brand: c.brand || null,
      closing_day: c.closing_day,
      due_day: c.due_day,
      color: c.color || null,
      last_four: c.last_four || null,
      credit_limit_cents: c.credit_limit_cents ?? null,
    })
    .select("id, name, color")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/cartoes");
  return { card: data };
}

type IncomeActionState =
  | { error?: string; income?: { id: string; description: string; amountCents: number } }
  | undefined;

/** Registra uma renda recorrente informada no onboarding. Não redireciona — o wizard controla a navegação. */
export async function saveOnboardingIncome(
  _prev: IncomeActionState,
  formData: FormData,
): Promise<IncomeActionState> {
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

  const businessDayMode = i.recurring_mode === "nth_business_day";
  // No modo "dia útil", a data de recebimento é o N-ésimo dia útil do próprio mês.
  const receiptDate = businessDayMode
    ? toISO(y, m0, nthBusinessDay(y, m0, i.recurring_business_day ?? 5))
    : i.receipt_date;

  const { data, error } = await supabase
    .from("incomes")
    .insert({
      user_id: user.id,
      description: i.description,
      amount_cents: i.amount_cents,
      receipt_date: receiptDate,
      reference_month: referenceMonth,
      is_recurring: true,
      recurring_mode: i.recurring_mode,
      recurring_day: businessDayMode ? null : (i.recurring_day ?? Number(i.receipt_date.slice(8, 10))),
      recurring_business_day: businessDayMode ? (i.recurring_business_day ?? 5) : null,
    })
    .select("id, description, amount_cents")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/recebimentos");
  revalidatePath("/");
  return { income: { id: data.id, description: data.description, amountCents: data.amount_cents } };
}

/** Marca o onboarding como concluído (ou pulado) e manda para o dashboard. */
export async function completeOnboarding(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.updateUser({ data: { onboarding_pending: false } });
  revalidatePath("/");
  redirect("/");
}
