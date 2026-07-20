"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cardSchema, type CardInput } from "@/lib/schemas";

type ActionState = { error?: string } | undefined;

function emptyToNull(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

function cardInsertPayload(userId: string, c: CardInput) {
  return {
    user_id: userId,
    name: c.name,
    brand: emptyToNull(c.brand),
    closing_day: c.closing_day,
    due_day: c.due_day,
    color: emptyToNull(c.color),
    last_four: emptyToNull(c.last_four),
    credit_limit_cents: c.credit_limit_cents ?? null,
  };
}

export async function createCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.from("cards").insert(cardInsertPayload(user.id, parsed.data));
  if (error) return { error: error.message };

  revalidatePath("/cartoes");
  redirect("/cartoes");
}

type InlineCardState =
  | {
      error?: string;
      ok?: boolean;
      card?: {
        id: string;
        name: string;
        last_four: string | null;
        color: string | null;
        closing_day: number;
        due_day: number;
      };
    }
  | undefined;

/**
 * Variante de createCard para uso fora de um <form> (modal de confirmação de
 * cartão na importação de fatura): recebe o payload já pronto em vez de
 * FormData e RETORNA o cartão criado em vez de redirecionar, para não quebrar
 * o fluxo client-side que a chama (mesmo motivo do retorno em
 * importarGastosDaFatura).
 */
export async function createCardInline(
  _prev: InlineCardState,
  payload: unknown,
): Promise<InlineCardState> {
  const parsed = cardSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data, error } = await supabase
    .from("cards")
    .insert(cardInsertPayload(user.id, parsed.data))
    .select("id, name, last_four, color, closing_day, due_day")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/cartoes");
  return { ok: true, card: data };
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
