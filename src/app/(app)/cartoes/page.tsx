import Link from "next/link";
import { CalendarClock, ChevronRight, CreditCard, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  currentReferenceMonth,
  formatDayMonth,
  formatMonthLabel,
  shiftReferenceMonth,
} from "@/lib/date";
import { invoiceRefForMonth, ymd } from "@/lib/invoice";
import { aggregateInstallmentTotals } from "@/lib/reports";
import { resolveOpenMonths } from "@/lib/card-invoices";
import { materializeRecurringExpenses } from "@/lib/recurring";
import { formatCents } from "@/lib/money";

/** Rótulo do valor conforme a distância entre a fatura em aberto e o mês corrente. */
function openMonthLabel(currentMonth: string, openMonth: string): string {
  if (openMonth === currentMonth) return "este mês";
  if (openMonth === shiftReferenceMonth(currentMonth, 1)) return "próximo mês";
  return formatMonthLabel(openMonth);
}

export default async function CartoesPage() {
  const supabase = await createClient();

  const { data: cards } = await supabase
    .from("cards")
    .select("id, name, brand, closing_day, due_day, color, last_four")
    .eq("active", true)
    .order("created_at", { ascending: true });

  const currentMonth = currentReferenceMonth();
  const nextMonth = shiftReferenceMonth(currentMonth, 1);

  // Materializa recorrentes do mês corrente e do próximo (por usuário, não por
  // cartão) para que o total da fatura em aberto — inclusive quando ela já é a do
  // "próximo mês" — não venha subestimado. Mesmo padrão do detalhe do cartão.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await materializeRecurringExpenses(supabase, user.id, currentMonth);
    await materializeRecurringExpenses(supabase, user.id, nextMonth);
  }

  const cardIds = (cards ?? []).map((c) => c.id);

  // Mês da próxima fatura em aberto por cartão (progride ao marcar como paga).
  const openByCard = await resolveOpenMonths(supabase, cardIds, currentMonth);
  const openMonths = [...new Set([...openByCard.values()])];

  // Total das parcelas das faturas em aberto (uma query, agregada por cartão+mês).
  const { data: installments } = cardIds.length
    ? await supabase
        .from("installments")
        .select("card_id, reference_month, amount_cents")
        .in("card_id", cardIds)
        .in("reference_month", openMonths)
        .is("deleted_at", null)
    : { data: [] };
  const totals = aggregateInstallmentTotals(installments ?? []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cartões</h1>
        <Link
          href="/cartoes/novo"
          className="flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Novo
        </Link>
      </div>

      {cards && cards.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => {
            const openMonth = openByCard.get(card.id) ?? currentMonth;
            const [ry, rm0] = ymd(openMonth);
            const ref = invoiceRefForMonth(ry, rm0, {
              closingDay: card.closing_day,
              dueDay: card.due_day,
            });
            const total = totals.get(`${card.id}|${openMonth}`) ?? 0;

            return (
              <li key={card.id}>
                <Link
                  href={`/cartoes/${card.id}`}
                  className="flex flex-col gap-3 rounded-2xl p-4 text-white shadow-sm"
                  style={{ backgroundColor: card.color ?? "#16a34a" }}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{card.name}</p>
                      {card.brand && <p className="text-xs opacity-90">{card.brand}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-90">{openMonthLabel(currentMonth, openMonth)}</p>
                      <p className="text-lg font-bold">{formatCents(total)}</p>
                    </div>
                    <ChevronRight size={18} className="opacity-80" />
                  </div>

                  <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-medium">
                    <CalendarClock size={16} className="shrink-0 opacity-90" />
                    <span>
                      Fecha {formatDayMonth(ref.closingDate)} · Vence {formatDayMonth(ref.dueDate)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Link
          href="/cartoes/novo"
          className="flex items-center gap-3 rounded-2xl border border-dashed border-neutral-300 p-6 dark:border-neutral-700"
        >
          <CreditCard className="text-brand" />
          <span className="text-sm">Cadastre seu primeiro cartão para começar.</span>
        </Link>
      )}
    </div>
  );
}
