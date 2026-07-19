"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cardSchema, incomeSchema } from "@/lib/schemas";
import { toISO, ymd } from "@/lib/invoice";

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

  const { data, error } = await supabase
    .from("incomes")
    .insert({
      user_id: user.id,
      description: i.description,
      amount_cents: i.amount_cents,
      receipt_date: i.receipt_date,
      reference_month: referenceMonth,
      is_recurring: true,
      recurring_mode: "day_of_month",
      recurring_day: i.recurring_day ?? Number(i.receipt_date.slice(8, 10)),
      recurring_business_day: null,
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
