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

function brDate(iso: string): string {
  return iso.split("-").reverse().join("/");
}

function brMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Exporta todas as parcelas do usuário como CSV (compatível com Excel pt-BR). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: installments }, { data: txs }, { data: cards }, { data: accounts }, { data: categories }] =
    await Promise.all([
      supabase
        .from("installments")
        .select("number, amount_cents, reference_month, status, transaction_id, card_id, account_id")
        .is("deleted_at", null)
        .order("reference_month"),
      supabase.from("transactions").select("id, description, kind, purchase_date, installments_count, category_id"),
      supabase.from("cards").select("id, name"),
      supabase.from("accounts").select("id, name"),
      supabase.from("categories").select("id, name"),
    ]);

  const txById = new Map((txs ?? []).map((t) => [t.id, t]));
  const nameById = new Map<string, string>();
  for (const c of cards ?? []) nameById.set(c.id, c.name);
  for (const a of accounts ?? []) nameById.set(a.id, a.name);
  const catById = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const header = [
    "Competencia", "Data da compra", "Descricao", "Categoria", "Origem", "Tipo",
    "Parcela", "Total parcelas", "Valor parcela", "Status",
  ];

  const rows = [header.map(csvCell).join(";")];
  for (const it of installments ?? []) {
    const tx = txById.get(it.transaction_id);
    if (!tx) continue;
    const origem = it.card_id ? nameById.get(it.card_id) : it.account_id ? nameById.get(it.account_id) : "";
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
        it.status === "paid" ? "Paga" : "Aberta",
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
    },
  });
}
