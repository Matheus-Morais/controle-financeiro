"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cardSchema } from "@/lib/schemas";

type ActionState = { error?: string } | undefined;

function emptyToNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

export async function createCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const c = parsed.data;
  const { error } = await supabase.from("cards").insert({
    user_id: user.id,
    name: c.name,
    brand: emptyToNull(c.brand),
    closing_day: c.closing_day,
    due_day: c.due_day,
    color: emptyToNull(c.color),
    last_four: emptyToNull(c.last_four),
    credit_limit_cents: c.credit_limit_cents ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/cartoes");
  redirect("/cartoes");
}

export async function updateCard(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = cardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const c = parsed.data;
  const { error } = await supabase
    .from("cards")
    .update({
      name: c.name,
      brand: emptyToNull(c.brand),
      closing_day: c.closing_day,
      due_day: c.due_day,
      color: emptyToNull(c.color),
      last_four: emptyToNull(c.last_four),
      credit_limit_cents: c.credit_limit_cents ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/cartoes");
  redirect(`/cartoes/${id}`);
}

export async function deleteCard(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("cards").delete().eq("id", id);
  revalidatePath("/cartoes");
  redirect("/cartoes");
}

/** Alterna o status da fatura (aberta ↔ paga). */
export async function toggleInvoicePaid(invoiceId: string, paid: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({ status: paid ? "paid" : "open", paid_at: paid ? new Date().toISOString() : null })
    .eq("id", invoiceId);
  revalidatePath("/cartoes", "layout");
}
