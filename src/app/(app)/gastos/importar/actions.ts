"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBRLToCents } from "@/lib/money";
import { shiftReferenceMonth } from "@/lib/date";
import {
  buildImportRows,
  importPayloadSchema,
  type ExistingOccurrence,
  type ExistingRecurring,
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

  // Assinaturas do usuário — mesmo cuidado para o vínculo com template existente.
  const { data: recs } = await supabase.from("recurring_expenses").select("id");
  const ownRecurrings = new Set((recs ?? []).map((r) => r.id));

  // Converte valores (money.ts é o ponto único) e monta os itens validados.
  const validated: ValidatedImportItem[] = [];
  // Ids das assinaturas CRIADAS agora (as vinculadas a template existente ficam
  // de fora — senão o insert abaixo duplicaria a assinatura).
  const newRecurringIds = new Set<string>();
  for (const it of items) {
    const amountCents = parseBRLToCents(it.valor_brl);
    if (amountCents == null || amountCents <= 0) {
      return { error: `Valor inválido em "${it.description}".` };
    }
    const categoryId = it.category_id && ownCategories.has(it.category_id) ? it.category_id : null;
    // Item marcado como recorrente vira um template (recurring_expense) + transação
    // `recurring` na própria fatura. Assinatura não é parcela → ignora `parcela`.
    // Se a revisão casou o item com uma assinatura JÁ cadastrada, reaproveita esse
    // template (nada de duplicar); só id do próprio usuário é aceito.
    const linkedId =
      it.recurring_id && ownRecurrings.has(it.recurring_id) ? it.recurring_id : null;
    const recurringId = linkedId ?? (it.mark_as_recurring ? randomUUID() : null);
    if (recurringId && !linkedId) newRecurringIds.add(recurringId);
    // Só vira parcela se os números fizerem sentido (2+ parcelas, atual no intervalo).
    const p = it.parcela;
    const installment =
      !recurringId && p && p.total >= 2 && p.atual >= 1 && p.atual <= p.total
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
      recurringId,
    });
  }

  const rows = buildImportRows(validated, {
    userId: user.id,
    cardId: card_id,
    referenceMonth: reference_month,
    cycle: { closingDay: card.closing_day, dueDay: card.due_day },
  });

  // Templates de recorrência PRIMEIRO: a transação `recurring` referencia
  // `recurring_id` (FK), então o template precisa existir antes. Ids pré-gerados
  // em `validated[i].recurringId` ligam transação↔template sem round-trip.
  // O template começa no mês SEGUINTE — esta fatura já traz a ocorrência do mês
  // corrente (criada aqui como `recurring`); o cron materializa daí em diante,
  // sem risco de duplicar a competência importada.
  const recurringRows = validated
    .filter((v) => v.recurringId && newRecurringIds.has(v.recurringId))
    .map((v) => ({
      id: v.recurringId as string,
      user_id: user.id,
      card_id: card_id,
      account_id: null,
      category_id: v.categoryId,
      description: v.description,
      amount_cents: v.amountCents,
      // Dia de cobrança = dia da compra; fácil de ajustar depois na tela de Recorrentes.
      billing_day: parseInt(v.purchaseDate.slice(8, 10), 10),
      start_month: shiftReferenceMonth(reference_month, 1),
      end_month: null,
      active: true,
    }));

  if (recurringRows.length > 0) {
    const { error: recErr } = await supabase.from("recurring_expenses").insert(recurringRows);
    if (recErr) {
      console.error("[importar] erro ao gravar recorrentes:", recErr.code);
      return { error: "Erro ao salvar os lançamentos. Tente novamente." };
    }
  }

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
    .upsert(rows.invoices, { onConflict: "card_id,reference_month", ignoreDuplicates: true });
  if (invErr) {
    console.error("[importar] erro ao upsert fatura:", invErr.code);
    return { error: "Erro ao salvar os lançamentos. Tente novamente." };
  }

  revalidatePath("/", "layout");
  // Retorna sucesso (não redirect): a navegação é client-side no componente, o
  // que resolve o pending na hora e evita o spinner preso no mobile.
  return { ok: true, cardId: card_id, referenceMonth: reference_month };
}

/**
 * O que o cartão JÁ tem, para a revisão saber o que é novo. Duas partes:
 *
 * - `occurrences`: cada parcela viva do cartão (TODOS os meses) com os dados da
 *   sua transação. É o cartão inteiro, e não só a competência, porque as parcelas
 *   futuras de um parcelamento já foram materializadas em competências seguintes
 *   — sem isso, subir a fatura do mês seguinte recriaria a cadeia toda.
 * - `recurrings`: as assinaturas ativas do cartão vigentes na competência, com os
 *   apelidos que já apareceram em faturas (para casar o nome bruto do PDF) e se
 *   já estão lançadas no mês.
 *
 * Substitui a lista de chaves de dedupe antiga, que descartava tudo sem
 * `statement_description` — e era por isso que os recorrentes materializados pelo
 * cron voltavam como novos a cada fatura importada.
 */
export async function getExistingInvoiceContext(
  cardId: string,
  referenceMonth: string,
): Promise<{ occurrences: ExistingOccurrence[]; recurrings: ExistingRecurring[] }> {
  const empty = { occurrences: [], recurrings: [] };
  if (!/^[0-9a-f-]{36}$/i.test(cardId) || !/^\d{4}-\d{2}-01$/.test(referenceMonth)) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  // Parcelas vivas do cartão inteiro + assinaturas vigentes na competência.
  const [{ data: installments }, { data: templates }] = await Promise.all([
    supabase
      .from("installments")
      .select("amount_cents, number, transaction_id, reference_month")
      .eq("card_id", cardId)
      .is("deleted_at", null),
    supabase
      .from("recurring_expenses")
      .select("id, description, amount_cents")
      .eq("card_id", cardId)
      .eq("active", true)
      .lte("start_month", referenceMonth)
      .or(`end_month.is.null,end_month.gte.${referenceMonth}`),
  ]);

  const txIds = [...new Set((installments ?? []).map((i) => i.transaction_id))];
  const { data: txs } = txIds.length
    ? await supabase
        .from("transactions")
        .select("id, description, statement_description, purchase_date, kind, installments_count, recurring_id")
        .in("id", txIds)
    : { data: [] };
  const txById = new Map((txs ?? []).map((t) => [t.id, t]));

  const occurrences: ExistingOccurrence[] = [];
  for (const inst of installments ?? []) {
    const tx = txById.get(inst.transaction_id);
    if (!tx) continue;
    occurrences.push({
      transactionId: tx.id,
      kind: tx.kind,
      statementDescription: tx.statement_description,
      description: tx.description,
      amountCents: inst.amount_cents,
      purchaseDate: tx.purchase_date,
      referenceMonth: inst.reference_month,
      number: inst.number,
      installmentsCount: tx.installments_count,
      recurringId: tx.recurring_id,
    });
  }

  const templateIds = (templates ?? []).map((t) => t.id);
  // Apelidos: o nome BRUTO com que a assinatura já apareceu em faturas passadas —
  // sinal muito mais forte que o nome amigável do template.
  const { data: aliasRows } = templateIds.length
    ? await supabase
        .from("transactions")
        .select("recurring_id, statement_description")
        .in("recurring_id", templateIds)
        .not("statement_description", "is", null)
    : { data: [] };

  const aliasesById = new Map<string, Set<string>>();
  for (const row of aliasRows ?? []) {
    if (!row.recurring_id || !row.statement_description) continue;
    const set = aliasesById.get(row.recurring_id) ?? new Set<string>();
    set.add(row.statement_description);
    aliasesById.set(row.recurring_id, set);
  }

  // Materializada = tem ocorrência NA COMPETÊNCIA importada (não em outro mês).
  const materializedIds = new Set(
    occurrences
      .filter((o) => o.referenceMonth === referenceMonth)
      .map((o) => o.recurringId)
      .filter((id): id is string => id != null),
  );

  const recurrings: ExistingRecurring[] = (templates ?? []).map((t) => ({
    id: t.id,
    description: t.description,
    amountCents: t.amount_cents,
    aliases: [...(aliasesById.get(t.id) ?? [])],
    materialized: materializedIds.has(t.id),
  }));

  return { occurrences, recurrings };
}
