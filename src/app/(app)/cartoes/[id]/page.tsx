import { notFound } from "next/navigation";
import { CalendarCheck, CalendarClock, FileUp, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BackLink, HeaderIconLink } from "@/components/back-link";
import { currentReferenceMonth, formatDayMonth } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { invoiceRefForMonth, ymd } from "@/lib/invoice";
import { resolveOpenMonths } from "@/lib/card-invoices";
import { formatCents } from "@/lib/money";
import { InvoiceTabs, type InvoiceItem } from "@/components/invoice-tabs";
import { InvoicePaidToggle } from "@/components/invoice-paid-toggle";
import { MonthNav } from "@/components/month-nav";
import { getSessionUser } from "@/lib/auth";
import { materializeRecurringMonths } from "@/lib/recurring";

type Kind = "installment" | "recurring" | "single";

/**
 * Limite disponível do cartão: teto informado no cadastro menos o que já está
 * comprometido — a soma das parcelas vivas nas competências cuja fatura ainda
 * está EM ABERTO. Faturas pagas já liberaram o limite.
 *
 * A soma vem do banco (`card_committed_cents`, migration 0018): eram duas idas em
 * série (faturas abertas → parcelas dessas competências), com o total montado em
 * JS sobre todas as linhas — e portanto sujeito ao corte de `max-rows`.
 *
 * Devolve `null` quando o usuário não informou o limite (o campo era coletado e
 * nunca usado; agora ou serve, ou some da tela).
 */
async function availableLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  creditLimitCents: number | null,
): Promise<number | null> {
  if (creditLimitCents == null || creditLimitCents <= 0) return null;

  const { data: committed, error } = await supabase.rpc("card_committed_cents", {
    p_card_id: cardId,
  });
  if (error) return null;

  return creditLimitCents - (committed ?? 0);
}

export default async function CartaoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    mes?: string;
    /** Nº de competências pagas descartadas ao encurtar um parcelamento (AJ-19). */
    pagas_descartadas?: string;
    /** Nº de faturas em aberto cujas datas foram recalculadas ao mudar o ciclo. */
    faturas_recalculadas?: string;
  }>;
}) {
  const { id } = await params;
  const { mes, pagas_descartadas, faturas_recalculadas } = await searchParams;
  const supabase = await createClient();

  // Cartão, timezone e sessão são independentes — em série eram três round-trips.
  const [{ data: card }, tz, user] = await Promise.all([
    supabase.from("cards").select("*").eq("id", id).single(),
    sessionTimezone(supabase),
    getSessionUser(),
  ]);
  if (!card) notFound();

  // Sem `?mes`, cai na PRÓXIMA fatura em aberto: se a fatura do mês corrente já foi
  // paga, progride para o mês seguinte (mesma lógica da lista de cartões). Com
  // `?mes` presente (navegação explícita), respeita o mês pedido — e aí a consulta
  // das faturas pagas não precisa acontecer, que é o caso de toda navegação de mês.
  const currentMonth = currentReferenceMonth(tz);
  const refMonth =
    mes ?? (await resolveOpenMonths(supabase, [id], currentMonth)).get(id) ?? currentMonth;

  // Recorrentes são propagados a TODOS os meses: materializa (idempotente) o mês
  // exibido antes de ler a fatura, para que assinaturas ativas apareçam mesmo em
  // meses que o cron do dia 1 ainda não alcançou (passado/futuro navegável). A
  // competência do recorrente é sempre o próprio mês (ver lib/recurring.ts), então
  // basta materializar o mês exibido.
  if (user) {
    await materializeRecurringMonths(supabase, user.id, [refMonth]);
  }

  // Tudo o que a tela lê depois da materialização é independente entre si: os
  // itens da fatura, a capa e o limite comprometido. Antes eram quatro esperas em
  // série no fim da renderização (parcelas → transações → capa → limite).
  //
  // `invoice_items` já traz a transação junta e inclui as parcelas excluídas
  // (soft-delete): elas continuam visíveis, esmaecidas e no fim da lista.
  const [{ data: items }, { data: invoice }, availableCents] = await Promise.all([
    supabase.rpc("invoice_items", { p_card_id: id, p_ref_month: refMonth }),
    supabase
      .from("invoices")
      .select("id, closing_date, due_date, status")
      .eq("card_id", id)
      .eq("reference_month", refMonth)
      .maybeSingle(),
    // Limite disponível: o teto do cartão menos tudo o que já está comprometido —
    // as parcelas vivas das faturas ainda EM ABERTO (as pagas já saíram do limite).
    // Só aparece quando o usuário informou o limite no cadastro.
    availableLimit(supabase, id, card.credit_limit_cents),
  ]);

  const groups: Record<Kind, InvoiceItem[]> = { installment: [], recurring: [], single: [] };
  let total = 0;
  for (const it of items ?? []) {
    const deleted = it.deleted_at != null;
    // Excluídos não entram no total da fatura.
    if (!deleted) total += it.amount_cents;
    groups[it.kind as Kind].push({
      id: it.id,
      transactionId: it.transaction_id,
      description: it.description,
      amountCents: it.amount_cents,
      number: it.number,
      installmentsCount: it.installments_count,
      purchaseDate: it.purchase_date,
      deleted,
    });
  }

  const [ry, rm0] = ymd(refMonth);
  const computed = invoiceRefForMonth(ry, rm0, {
    closingDay: card.closing_day,
    dueDay: card.due_day,
  });
  const dueDate = invoice?.due_date ?? computed.dueDate;
  const closingDate = invoice?.closing_date ?? computed.closingDate;

  const notices = [
    pagas_descartadas && Number(pagas_descartadas) > 0
      ? `${pagas_descartadas} competência(s) que estavam marcadas como pagas saíram do novo parcelamento. Confira as parcelas.`
      : null,
    faturas_recalculadas && Number(faturas_recalculadas) > 0
      ? `${faturas_recalculadas} fatura(s) em aberto tiveram as datas recalculadas com o novo ciclo.`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackLink href="/cartoes" label="Voltar para os cartões" />
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{card.name}</h1>
        <HeaderIconLink
          href={`/gastos/importar?cartao=${id}`}
          label="Importar fatura deste cartão"
          title="Importar fatura (PDF)"
        >
          <FileUp size={20} />
        </HeaderIconLink>
        <HeaderIconLink href={`/cartoes/${id}/editar`} label="Editar cartão" edge>
          <Pencil size={20} />
        </HeaderIconLink>
      </div>

      {notices.map((n) => (
        <p
          key={n}
          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {n}
        </p>
      ))}

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

        {availableCents != null && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
            <span className="opacity-90">Limite disponível</span>
            <span className="font-semibold">{formatCents(Math.max(0, availableCents))}</span>
          </div>
        )}

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
