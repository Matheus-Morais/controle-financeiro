"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBRLToCents } from "@/lib/money";
import {
  buildImportRows,
  dedupeKey,
  importPayloadSchema,
  type ValidatedImportItem,
} from "@/lib/invoice-import";

type ActionState =
  | { error?: string; ok?: boolean; cardId?: string; referenceMonth?: string }
  | undefined;

/**
 * Grava os lançamentos revisados de uma fatura como gastos no cartão. Cada item
 * vira uma transação `single` + uma parcela na competência escolhida (forçada),
 * mais o upsert da fatura. Reutiliza a sequência do createExpense em lote.
 */
export async function importarGastosDaFatura(
  _prev: ActionState,
  payload: unknown,
): Promise<ActionState> {
  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const { card_id, reference_month, items } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: card } = await supabase
    .from("cards")
    .select("closing_day, due_day")
    .eq("id", card_id)
    .single();
  if (!card) return { error: "Cartão não encontrado." };

  // Categorias do usuário — para não gravar category_id de terceiros (RLS não valida FK).
  const { data: cats } = await supabase.from("categories").select("id");
  const ownCategories = new Set((cats ?? []).map((c) => c.id));

  // Converte valores (money.ts é o ponto único) e monta os itens validados.
  const validated: ValidatedImportItem[] = [];
  for (const it of items) {
    const amountCents = parseBRLToCents(it.valor_brl);
    if (amountCents == null || amountCents <= 0) {
      return { error: `Valor inválido em "${it.description}".` };
    }
    const categoryId = it.category_id && ownCategories.has(it.category_id) ? it.category_id : null;
    // Só vira parcela se os números fizerem sentido (2+ parcelas, atual no intervalo).
    const p = it.parcela;
    const installment =
      p && p.total >= 2 && p.atual >= 1 && p.atual <= p.total
        ? { number: p.atual, count: p.total }
        : null;
    validated.push({
      id: randomUUID(),
      description: it.description,
      statementDescription: it.statement_description,
      amountCents,
      purchaseDate: it.purchase_date,
      categoryId,
      installment,
    });
  }

  const rows = buildImportRows(validated, {
    userId: user.id,
    cardId: card_id,
    referenceMonth: reference_month,
    cycle: { closingDay: card.closing_day, dueDay: card.due_day },
  });

  // Gravação em lote (não atômica; ver limitação no plano). Ids pré-gerados
  // ligam parcela↔transação sem depender da ordem de retorno do insert.
  const { error: txErr } = await supabase.from("transactions").insert(rows.transactions);
  if (txErr) {
    console.error("[importar] erro ao gravar transações:", txErr.code);
    return { error: "Erro ao salvar os lançamentos. Tente novamente." };
  }

  const { error: instErr } = await supabase.from("installments").insert(rows.installments);
  if (instErr) {
    console.error("[importar] erro ao gravar parcelas:", instErr.code);
    return { error: "Erro ao salvar os lançamentos. Tente novamente." };
  }

  const { error: invErr } = await supabase
    .from("invoices")
    .upsert([rows.invoice], { onConflict: "card_id,reference_month", ignoreDuplicates: true });
  if (invErr) {
    console.error("[importar] erro ao upsert fatura:", invErr.code);
    return { error: "Erro ao salvar os lançamentos. Tente novamente." };
  }

  // Cria RecurringExpense para itens marcados como recorrente.
  const recurringItems = items
    .map((it, i) => ({ it, validated: validated[i] }))
    .filter(({ it }) => it.mark_as_recurring);

  if (recurringItems.length > 0) {
    const recurringRows = recurringItems.map(({ it, validated: v }) => ({
      user_id: user.id,
      card_id: card_id,
      account_id: null,
      category_id: v.categoryId,
      description: v.description,
      amount_cents: v.amountCents,
      // Dia de cobrança = dia da compra; fácil de ajustar depois na tela de Recorrentes.
      billing_day: parseInt(it.purchase_date.slice(8, 10), 10),
      start_month: reference_month,
      end_month: null,
      active: true,
    }));
    const { error: recErr } = await supabase.from("recurring_expenses").insert(recurringRows);
    if (recErr) return { error: recErr.message };
  }

  revalidatePath("/", "layout");
  // Retorna sucesso (não redirect): a navegação é client-side no componente, o
  // que resolve o pending na hora e evita o spinner preso no mobile.
  return { ok: true, cardId: card_id, referenceMonth: reference_month };
}

/**
 * Chaves de deduplicação dos lançamentos já existentes num (cartão, competência).
 * Usado pela tela de revisão para marcar linhas já importadas antes de gravar.
 */
export async function getExistingInvoiceKeys(
  cardId: string,
  referenceMonth: string,
): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/i.test(cardId) || !/^\d{4}-\d{2}-01$/.test(referenceMonth)) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: installments } = await supabase
    .from("installments")
    .select("amount_cents, transaction_id")
    .eq("card_id", cardId)
    .eq("reference_month", referenceMonth);

  if (!installments?.length) return [];

  const txIds = [...new Set(installments.map((i) => i.transaction_id))];
  const { data: txs } = await supabase
    .from("transactions")
    .select("id, statement_description, purchase_date")
    .in("id", txIds);
  const txById = new Map((txs ?? []).map((t) => [t.id, t]));

  const keys: string[] = [];
  for (const it of installments) {
    const tx = txById.get(it.transaction_id);
    if (!tx?.statement_description) continue; // só o que veio de import tem nome bruto
    keys.push(dedupeKey(tx.statement_description, it.amount_cents, tx.purchase_date));
  }
  return keys;
}
