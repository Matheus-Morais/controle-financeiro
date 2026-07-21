import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, shiftReferenceMonth } from "@/lib/date";
import { invoiceRefForMonth, ymd } from "@/lib/invoice";
import { formatCents } from "@/lib/money";
import { InvoiceTabs, type InvoiceItem } from "@/components/invoice-tabs";
import { InvoicePaidToggle } from "@/components/invoice-paid-toggle";
import { MonthNav } from "@/components/month-nav";
import { materializeRecurringExpenses } from "@/lib/recurring";

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

  // Recorrentes são propagados a TODOS os meses: materializa (idempotente) o mês
  // exibido antes de ler a fatura, para que assinaturas ativas apareçam mesmo em
  // meses que o cron do dia 1 ainda não alcançou (passado/futuro navegável).
  // Materializa também o mês anterior: uma compra recorrente de M-1 cujo billing_day
  // cai após o fechamento entra na fatura de M, então M-1 precisa estar materializado.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await materializeRecurringExpenses(supabase, user.id, shiftReferenceMonth(refMonth, -1));
    await materializeRecurringExpenses(supabase, user.id, refMonth);
  }

  // Parcelas do mês + transações associadas (kind/descrição/data). Inclui as
  // excluídas (soft-delete): elas continuam visíveis, esmaecidas e no fim da lista.
  const { data: installments } = await supabase
    .from("installments")
    .select("id, number, amount_cents, transaction_id, deleted_at")
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
    const deleted = it.deleted_at != null;
    // Excluídos não entram no total da fatura.
    if (!deleted) total += it.amount_cents;
    groups[tx.kind as Kind].push({
      id: it.id,
      transactionId: it.transaction_id,
      description: tx.description,
      amountCents: it.amount_cents,
      number: it.number,
      installmentsCount: tx.installments_count,
      purchaseDate: tx.purchase_date,
      deleted,
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
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{card.name}</h1>
        <Link href={`/cartoes/${id}/editar`} className="text-neutral-500">
          <Pencil size={20} />
        </Link>
      </div>

      <MonthNav basePath={`/cartoes/${id}`} refMonth={refMonth} />

      {/* Resumo da fatura */}
      <div
        key={refMonth}
        className="animate-month-in rounded-2xl p-4 text-white shadow-sm motion-reduce:animate-none"
        style={{ backgroundColor: card.color ?? "#16a34a" }}
      >
        <p className="text-xs opacity-90">Total da fatura</p>
        <p className="text-3xl font-bold">{formatCents(total)}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs opacity-90">
            Vence em {dueDate.split("-").reverse().join("/")}
          </span>
          {invoice && (
            <InvoicePaidToggle
              invoiceId={invoice.id}
              paid={invoice.status === "paid"}
              cardId={id}
              currentMonth={refMonth}
            />
          )}
        </div>
      </div>

      <InvoiceTabs groups={groups} currentMonth={refMonth} cardId={id} />
    </div>
  );
}
