import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatMonthLabel, shiftReferenceMonth } from "@/lib/date";
import { invoiceRefForMonth, ymd } from "@/lib/invoice";
import { formatCents } from "@/lib/money";
import { InvoiceTabs, type InvoiceItem } from "@/components/invoice-tabs";
import { InvoicePaidToggle } from "@/components/invoice-paid-toggle";

type Kind = "installment" | "recurring" | "single";

export default async function CartaoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes } = await searchParams;
  const supabase = await createClient();

  const { data: card } = await supabase.from("cards").select("*").eq("id", id).single();
  if (!card) notFound();

  const refMonth = mes ?? currentReferenceMonth();

  // Parcelas do mês + transações associadas (kind/descrição/data).
  const { data: installments } = await supabase
    .from("installments")
    .select("id, number, amount_cents, transaction_id")
    .eq("card_id", id)
    .eq("reference_month", refMonth);

  const txIds = [...new Set((installments ?? []).map((i) => i.transaction_id))];
  const { data: txs } = txIds.length
    ? await supabase
        .from("transactions")
        .select("id, description, kind, installments_count, purchase_date")
        .in("id", txIds)
    : { data: [] };
  const txById = new Map((txs ?? []).map((t) => [t.id, t]));

  const groups: Record<Kind, InvoiceItem[]> = { installment: [], recurring: [], single: [] };
  let total = 0;
  for (const it of installments ?? []) {
    const tx = txById.get(it.transaction_id);
    if (!tx) continue;
    total += it.amount_cents;
    groups[tx.kind as Kind].push({
      id: it.id,
      description: tx.description,
      amountCents: it.amount_cents,
      number: it.number,
      installmentsCount: tx.installments_count,
      purchaseDate: tx.purchase_date,
    });
  }

  // Fatura do mês (para datas e marcar como paga).
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, closing_date, due_date, status")
    .eq("card_id", id)
    .eq("reference_month", refMonth)
    .maybeSingle();

  const [ry, rm0] = ymd(refMonth);
  const computed = invoiceRefForMonth(ry, rm0, {
    closingDay: card.closing_day,
    dueDay: card.due_day,
  });
  const dueDate = invoice?.due_date ?? computed.dueDate;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/cartoes" className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="flex-1 truncate text-2xl font-bold">{card.name}</h1>
        <Link href={`/cartoes/${id}/editar`} className="text-neutral-500">
          <Pencil size={20} />
        </Link>
      </div>

      {/* Seletor de mês */}
      <div className="flex items-center justify-between rounded-xl bg-white p-2 shadow-sm dark:bg-neutral-900">
        <Link
          href={`/cartoes/${id}?mes=${shiftReferenceMonth(refMonth, -1)}`}
          className="rounded-lg p-2 text-neutral-500"
        >
          <ChevronLeft size={20} />
        </Link>
        <span className="text-sm font-semibold">{formatMonthLabel(refMonth)}</span>
        <Link
          href={`/cartoes/${id}?mes=${shiftReferenceMonth(refMonth, 1)}`}
          className="rounded-lg p-2 text-neutral-500"
        >
          <ChevronRight size={20} />
        </Link>
      </div>

      {/* Resumo da fatura */}
      <div
        className="rounded-2xl p-4 text-white shadow-sm"
        style={{ backgroundColor: card.color ?? "#16a34a" }}
      >
        <p className="text-xs opacity-90">Total da fatura</p>
        <p className="text-3xl font-bold">{formatCents(total)}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs opacity-90">
            Vence em {dueDate.split("-").reverse().join("/")}
          </span>
          {invoice && <InvoicePaidToggle invoiceId={invoice.id} paid={invoice.status === "paid"} />}
        </div>
      </div>

      <InvoiceTabs groups={groups} />
    </div>
  );
}
