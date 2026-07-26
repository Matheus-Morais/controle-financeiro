import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  single: "À vista",
  installment: "Parcelado",
  recurring: "Recorrente",
};

function csvCell(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function brDate(iso: string | null): string {
  return iso ? iso.split("-").reverse().join("/") : "";
}

function brMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Exporta os dados financeiros do usuário como CSV (compatível com Excel pt-BR).
 *
 * Três seções em um único arquivo — parcelas, recebimentos e orçamentos — para
 * que o export sirva de portabilidade real (LGPD), e não só do extrato de gastos.
 * O conteúdo é PII: sai sempre com `no-store` para não ficar em cache de proxy
 * nem do browser.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [
    { data: installments },
    { data: txs },
    { data: cards },
    { data: accounts },
    { data: categories },
    { data: incomes },
    { data: budgets },
    { data: invoices },
  ] = await Promise.all([
    supabase
      .from("installments")
      .select(
        "number, amount_cents, reference_month, status, due_date, transaction_id, card_id, account_id",
      )
      .is("deleted_at", null)
      .order("reference_month"),
    supabase
      .from("transactions")
      .select("id, description, kind, purchase_date, installments_count, category_id"),
    supabase.from("cards").select("id, name"),
    supabase.from("accounts").select("id, name"),
    supabase.from("categories").select("id, name"),
    supabase
      .from("incomes")
      .select("description, amount_cents, receipt_date, reference_month, is_recurring")
      .order("reference_month"),
    supabase.from("budgets").select("category_id, reference_month, limit_cents"),
    supabase.from("invoices").select("card_id, reference_month, status"),
  ]);

  const txById = new Map((txs ?? []).map((t) => [t.id, t]));
  const nameById = new Map<string, string>();
  for (const c of cards ?? []) nameById.set(c.id, c.name);
  for (const a of accounts ?? []) nameById.set(a.id, a.name);
  const catById = new Map((categories ?? []).map((c) => [c.id, c.name]));

  // Status efetivo de uma parcela de cartão é o da FATURA dela (RN-13): marcar a
  // fatura como paga quita as parcelas daquela competência, e o CSV precisa
  // refletir isso em vez de listar "Aberta" para uma fatura já quitada.
  const paidInvoices = new Set(
    (invoices ?? []).filter((i) => i.status === "paid").map((i) => `${i.card_id}|${i.reference_month}`),
  );

  const rows: string[] = [];
  const section = (title: string, header: string[]) => {
    if (rows.length) rows.push("");
    rows.push(csvCell(title));
    rows.push(header.map(csvCell).join(";"));
  };

  // ── Parcelas ──────────────────────────────────────────────────────────────
  section("PARCELAS", [
    "Competencia", "Data da compra", "Descricao", "Categoria", "Origem", "Tipo",
    "Parcela", "Total parcelas", "Valor parcela", "Vencimento", "Status",
  ]);
  for (const it of installments ?? []) {
    const tx = txById.get(it.transaction_id);
    if (!tx) continue;
    const origem = it.card_id ? nameById.get(it.card_id) : it.account_id ? nameById.get(it.account_id) : "";
    const paga = it.card_id
      ? paidInvoices.has(`${it.card_id}|${it.reference_month}`)
      : it.status === "paid";
    rows.push(
      [
        it.reference_month.slice(0, 7),
        brDate(tx.purchase_date),
        tx.description,
        tx.category_id ? catById.get(tx.category_id) ?? "" : "",
        origem ?? "",
        KIND_LABEL[tx.kind] ?? tx.kind,
        it.number,
        tx.installments_count,
        brMoney(it.amount_cents),
        brDate(it.due_date),
        paga ? "Paga" : "Aberta",
      ]
        .map(csvCell)
        .join(";"),
    );
  }

  // ── Recebimentos ──────────────────────────────────────────────────────────
  section("RECEBIMENTOS", ["Competencia", "Data", "Descricao", "Valor", "Recorrente"]);
  for (const inc of incomes ?? []) {
    rows.push(
      [
        inc.reference_month.slice(0, 7),
        brDate(inc.receipt_date),
        inc.description,
        brMoney(inc.amount_cents),
        inc.is_recurring ? "Sim" : "Não",
      ]
        .map(csvCell)
        .join(";"),
    );
  }

  // ── Orçamentos ────────────────────────────────────────────────────────────
  section("ORCAMENTOS", ["Competencia", "Categoria", "Limite"]);
  for (const b of budgets ?? []) {
    rows.push(
      [
        b.reference_month ? b.reference_month.slice(0, 7) : "Todo mês",
        b.category_id ? catById.get(b.category_id) ?? "" : "Geral",
        brMoney(b.limit_cents),
      ]
        .map(csvCell)
        .join(";"),
    );
  }

  // BOM para o Excel reconhecer UTF-8 (acentos).
  const csv = "﻿" + rows.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="controle-financeiro-${today}.csv"`,
      // Histórico financeiro completo: não pode ficar em cache (RN-45).
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
