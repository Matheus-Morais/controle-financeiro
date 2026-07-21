import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CalendarClock, ChevronLeft, FileUp, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatDayMonth, shiftReferenceMonth } from "@/lib/date";
import { invoiceRefForMonth, ymd } from "@/lib/invoice";
import { resolveOpenMonths } from "@/lib/card-invoices";
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

  // Sem `?mes`, cai na PRÓXIMA fatura em aberto: se a fatura do mês corrente já foi
  // paga, progride para o mês seguinte (mesma lógica da lista de cartões). Com
  // `?mes` presente (navegação explícita), respeita o mês pedido.
  const currentMonth = currentReferenceMonth();
  const openByCard = await resolveOpenMonths(supabase, [id], currentMonth);
  const refMonth = mes ?? openByCard.get(id) ?? currentMonth;

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
  const closingDate = invoice?.closing_date ?? computed.closingDate;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/cartoes" className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{card.name}</h1>
        <Link
          href={`/gastos/importar?cartao=${id}`}
          className="text-neutral-500"
          aria-label="Importar fatura deste cartão"
          title="Importar fatura (PDF)"
        >
          <FileUp size={20} />
        </Link>
        <Link
          href={`/cartoes/${id}/editar`}
          className="text-neutral-500"
          aria-label="Editar cartão"
        >
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

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2">
            <CalendarClock size={18} className="shrink-0 opacity-90" />
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-wide opacity-80">Fecha</p>
              <p className="text-sm font-semibold">{formatDayMonth(closingDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2">
            <CalendarCheck size={18} className="shrink-0 opacity-90" />
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-wide opacity-80">Vence</p>
              <p className="text-sm font-semibold">{formatDayMonth(dueDate)}</p>
            </div>
          </div>
        </div>

        {invoice && (
          <div className="mt-2">
            <InvoicePaidToggle
              invoiceId={invoice.id}
              paid={invoice.status === "paid"}
              cardId={id}
              currentMonth={refMonth}
            />
          </div>
        )}
      </div>

      <InvoiceTabs groups={groups} currentMonth={refMonth} cardId={id} />
    </div>
  );
}
