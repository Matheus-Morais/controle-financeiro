"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { incomeSchema } from "@/lib/schemas";
import { toISO, ymd } from "@/lib/invoice";

type ActionState = { error?: string } | undefined;

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

  const { error } = await supabase.from("incomes").insert({
    user_id: user.id,
    description: i.description,
    amount_cents: i.amount_cents,
    receipt_date: i.receipt_date,
    reference_month: referenceMonth,
    is_recurring: i.is_recurring,
    recurring_day: i.is_recurring ? (i.recurring_day ?? Number(i.receipt_date.slice(8, 10))) : null,
  });
  if (error) return { error: error.message };

  revalidatePath("/recebimentos");
  revalidatePath("/");
  redirect(`/recebimentos?mes=${referenceMonth}`);
}

export async function deleteIncome(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("incomes").delete().eq("id", id);
  revalidatePath("/recebimentos");
  revalidatePath("/");
}
