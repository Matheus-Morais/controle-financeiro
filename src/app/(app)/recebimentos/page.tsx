import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatDayMonth } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { formatCents } from "@/lib/money";
import { DeleteButton } from "@/components/delete-button";
import { EndRecurrenceButton } from "@/components/end-recurrence-button";
import { MonthNav } from "@/components/month-nav";
import { deleteIncome, endIncomeRecurrence } from "./actions";

export default async function RecebimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const supabase = await createClient();
  const refMonth = mes ?? currentReferenceMonth(await sessionTimezone(supabase));

  const { data: incomes } = await supabase
    .from("incomes")
    .select("id, description, amount_cents, receipt_date, is_recurring, recurring_end_month")
    .eq("reference_month", refMonth)
    .order("receipt_date");

  const total = (incomes ?? []).reduce((s, i) => s + i.amount_cents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recebimentos</h1>
        <Link
          href="/recebimentos/novo"
          className="flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Novo
        </Link>
      </div>

      <MonthNav basePath="/recebimentos" refMonth={refMonth} />

      <div className="rounded-2xl bg-brand p-4 text-white shadow-sm">
        <p className="text-xs opacity-90">Total recebido no mês</p>
        <p className="text-3xl font-bold">{formatCents(total)}</p>
      </div>

      {incomes && incomes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {incomes.map((inc) => {
            // Encerrada = a repetição para nesta competência (ou antes). O
            // registro do mês continua existindo; só não se propaga adiante.
            const ended = inc.recurring_end_month != null && inc.recurring_end_month <= refMonth;
            return (
              <li
                key={inc.id}
                className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {inc.description}
                    {inc.is_recurring && !ended && (
                      <Repeat size={13} className="shrink-0 text-brand" />
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">
                    em {formatDayMonth(inc.receipt_date)}
                    {inc.is_recurring && ended && " · recorrência encerrada"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold">{formatCents(inc.amount_cents)}</span>
                  {inc.is_recurring && !ended && (
                    <EndRecurrenceButton onEnd={endIncomeRecurrence.bind(null, inc.id)} />
                  )}
                  <DeleteButton
                    onDelete={deleteIncome.bind(null, inc.id)}
                    confirmText="Excluir recebimento?"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-neutral-500">Nenhum recebimento neste mês.</p>
      )}
    </div>
  );
}
