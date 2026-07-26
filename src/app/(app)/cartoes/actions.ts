"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cardSchema, type CardInput } from "@/lib/schemas";
import { invoiceRefForMonth, ymd } from "@/lib/invoice";

type ActionState = { error?: string } | undefined;

/** Resultado das ações sem formulário (toggle/delete): erro explícito, nunca silêncio. */
type ActionResult = { error?: string };

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const c = parsed.data;

  // Ciclo anterior: se o fechamento/vencimento mudou, as faturas já criadas
  // guardam datas obsoletas — e o dashboard agrupa "o que vence no mês" por
  // `due_date`. Sem recalcular, o fluxo de caixa fica errado sem saída pela UI.
  const { data: before } = await supabase
    .from("cards")
    .select("closing_day, due_day")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!before) return { error: "Cartão não encontrado." };

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
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  let recalculated = 0;
  if (before.closing_day !== c.closing_day || before.due_day !== c.due_day) {
    const result = await recalcOpenInvoices(supabase, id, {
      closingDay: c.closing_day,
      dueDay: c.due_day,
    });
    if (result.error) return { error: result.error };
    recalculated = result.count;
  }

  revalidatePath("/cartoes", "layout");
  redirect(`/cartoes/${id}${recalculated > 0 ? `?faturas_recalculadas=${recalculated}` : ""}`);
}

/**
 * Reaplica o ciclo do cartão às faturas EM ABERTO. Faturas pagas ficam como
 * estão (RN-09): já foram quitadas nas datas antigas, reescrevê-las falsearia o
 * histórico. Retorna quantas foram atualizadas, para avisar o usuário.
 */
async function recalcOpenInvoices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  cycle: { closingDay: number; dueDay: number },
): Promise<{ count: number; error?: string }> {
  const { data: open } = await supabase
    .from("invoices")
    .select("id, reference_month")
    .eq("card_id", cardId)
    .eq("status", "open");
  if (!open?.length) return { count: 0 };

  for (const inv of open) {
    const [y, m0] = ymd(inv.reference_month);
    const ref = invoiceRefForMonth(y, m0, cycle);
    const { error } = await supabase
      .from("invoices")
      .update({ closing_date: ref.closingDate, due_date: ref.dueDate })
      .eq("id", inv.id);
    if (error) return { count: 0, error: error.message };
  }
  return { count: open.length };
}

export async function deleteCard(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.from("cards").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/cartoes");
  redirect("/cartoes");
}

/**
 * Alterna o status da fatura (aberta ↔ paga).
 *
 * A fatura é a FONTE DA VERDADE do pagamento de cartão (RN-13): as parcelas de
 * cartão não têm status próprio significativo — quem lê (CSV, relatórios)
 * deriva o status da parcela a partir da fatura da competência dela.
 */
export async function toggleInvoicePaid(invoiceId: string, paid: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase
    .from("invoices")
    .update({ status: paid ? "paid" : "open", paid_at: paid ? new Date().toISOString() : null })
    .eq("id", invoiceId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/cartoes", "layout");
  return {};
}
