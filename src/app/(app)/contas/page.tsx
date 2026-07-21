import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatDayMonth, shiftReferenceMonth, todayISO } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { materializeRecurringExpenses } from "@/lib/recurring";
import { MonthNav } from "@/components/month-nav";
import { BillPaidToggle } from "@/components/bill-paid-toggle";

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const refMonth = mes ?? currentReferenceMonth();

  // Contas fixas recorrentes são propagadas a todos os meses: materializa
  // (idempotente) o mês exibido antes de ler, para aparecerem mesmo em meses
  // que o cron do dia 1 ainda não alcançou.
  if (user) {
    await materializeRecurringExpenses(supabase, user.id, shiftReferenceMonth(refMonth, -1));
    await materializeRecurringExpenses(supabase, user.id, refMonth);
  }

  // Parcelas de origem CONTA (não-cartão) da competência.
  const { data: installments } = await supabase
    .from("installments")
    .select("id, account_id, amount_cents, due_date, status, transaction_id")
    .eq("reference_month", refMonth)
    .not("account_id", "is", null)
    .is("deleted_at", null);

  const rows = installments ?? [];
  const txIds = [...new Set(rows.map((r) => r.transaction_id))];
  const accIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))] as string[];

  const [{ data: txs }, { data: accounts }] = await Promise.all([
    supabase.from("transactions").select("id, description, kind").in("id", txIds),
    supabase.from("accounts").select("id, name, color").in("id", accIds),
  ]);

  const txById = new Map((txs ?? []).map((t) => [t.id, t]));
  const accById = new Map((accounts ?? []).map((a) => [a.id, a]));

  const items = rows
    .map((r) => ({
      id: r.id,
      description: txById.get(r.transaction_id)?.description ?? "Conta",
      kind: txById.get(r.transaction_id)?.kind ?? "single",
      accountName: r.account_id ? accById.get(r.account_id)?.name ?? "—" : "—",
      accountColor: (r.account_id ? accById.get(r.account_id)?.color : null) ?? "#64748b",
      amountCents: r.amount_cents,
      dueDate: r.due_date,
      paid: r.status === "paid",
    }))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  const total = items.reduce((s, i) => s + i.amountCents, 0);
  const paid = items.filter((i) => i.paid).reduce((s, i) => s + i.amountCents, 0);
  const open = total - paid;
  const today = todayISO();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contas</h1>
        <Link
          href="/gastos/novo"
          className="flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Lançar
        </Link>
      </div>

      <MonthNav basePath="/contas" refMonth={refMonth} />

      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="Total" value={formatCents(total)} />
        <SummaryTile label="Em aberto" value={formatCents(open)} accent="text-amber-600" />
        <SummaryTile label="Pago" value={formatCents(paid)} accent="text-emerald-600" />
      </div>

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const overdue = !it.paid && it.dueDate != null && it.dueDate < today;
            return (
              <li
                key={it.id}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
              >
                <span
                  className="h-9 w-9 shrink-0 rounded-full"
                  style={{ backgroundColor: it.accountColor }}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${it.paid ? "text-neutral-400 line-through" : ""}`}>
                    {it.description}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {it.accountName}
                    {it.dueDate && (
                      <span className={overdue ? "text-red-600" : ""}>
                        {" "}
                        · vence {formatDayMonth(it.dueDate)}
                        {overdue ? " (vencida)" : ""}
                      </span>
                    )}
                  </p>
                </div>
                <span className="font-semibold">{formatCents(it.amountCents)}</span>
                <BillPaidToggle installmentId={it.id} paid={it.paid} />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-neutral-500">
          <Receipt size={28} className="text-neutral-300" />
          <p>Nenhuma conta neste mês.</p>
          <p className="text-xs">
            Lance um gasto escolhendo uma forma de pagamento (PIX, conta, dinheiro) ou crie uma
            conta fixa em Recorrentes.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-base font-bold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
