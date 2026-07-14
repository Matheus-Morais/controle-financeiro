"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { expenseSchema, parseSource } from "@/lib/schemas";
import { generateInstallments } from "@/lib/installments";
import { invoiceRefForMonth, ymd } from "@/lib/invoice";

type ActionState = { error?: string } | undefined;

/** Contas (carteira) não têm fechamento; dia 31 faz a competência = mês da compra. */
const ACCOUNT_CLOSING_DAY = 31;

export async function createExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const e = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

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
  }

  const parcels = generateInstallments({
    totalAmountCents: e.amount_cents,
    count,
    purchaseDate: e.purchase_date,
    closingDay,
  });

  // 1) transação
  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      card_id: source.kind === "card" ? source.id : null,
      account_id: source.kind === "account" ? source.id : null,
      category_id: e.category_id || null,
      description: e.description,
      kind: e.kind,
      total_amount_cents: e.amount_cents,
      purchase_date: e.purchase_date,
      installments_count: count,
      notes: e.notes || null,
    })
    .select("id")
    .single();
  if (txErr || !tx) return { error: txErr?.message ?? "Falha ao salvar o gasto." };

  // 2) parcelas
  const { error: instErr } = await supabase.from("installments").insert(
    parcels.map((p) => ({
      user_id: user.id,
      transaction_id: tx.id,
      card_id: source.kind === "card" ? source.id : null,
      account_id: source.kind === "account" ? source.id : null,
      number: p.number,
      amount_cents: p.amountCents,
      reference_month: p.referenceMonth,
      status: "open" as const,
    })),
  );
  if (instErr) return { error: instErr.message };

  // 3) faturas por competência (só para cartões; não sobrescreve pagas)
  if (source.kind === "card") {
    const months = [...new Set(parcels.map((p) => p.referenceMonth))];
    const invoices = months.map((m) => {
      const [y, m0] = ymd(m);
      const ref = invoiceRefForMonth(y, m0, { closingDay, dueDay });
      return {
        user_id: user.id,
        card_id: source.id,
        reference_month: ref.referenceMonth,
        closing_date: ref.closingDate,
        due_date: ref.dueDate,
        status: "open" as const,
      };
    });
    await supabase
      .from("invoices")
      .upsert(invoices, { onConflict: "card_id,reference_month", ignoreDuplicates: true });
  }

  revalidatePath("/", "layout");
  redirect(source.kind === "card" ? `/cartoes/${source.id}` : "/");
}
