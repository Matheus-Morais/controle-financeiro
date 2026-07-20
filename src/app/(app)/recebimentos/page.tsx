import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatDayMonth } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { DeleteButton } from "@/components/delete-button";
import { MonthNav } from "@/components/month-nav";
import { deleteIncome } from "./actions";

export default async function RecebimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const refMonth = mes ?? currentReferenceMonth();
  const supabase = await createClient();

  const { data: incomes } = await supabase
    .from("incomes")
    .select("id, description, amount_cents, receipt_date, is_recurring")
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
          {incomes.map((inc) => (
            <li
              key={inc.id}
              className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  {inc.description}
                  {inc.is_recurring && <Repeat size={13} className="shrink-0 text-brand" />}
                </p>
                <p className="text-xs text-neutral-500">em {formatDayMonth(inc.receipt_date)}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold">{formatCents(inc.amount_cents)}</span>
                <DeleteButton onDelete={deleteIncome.bind(null, inc.id)} confirmText="Excluir recebimento?" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-neutral-500">Nenhum recebimento neste mês.</p>
      )}
    </div>
  );
}
