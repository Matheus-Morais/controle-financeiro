import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatDayMonth, shiftReferenceMonth, todayISO } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { Money } from "@/components/money";
import { HideValuesToggle } from "@/components/hide-values-toggle";
import { getSessionUser } from "@/lib/auth";
import { materializeRecurringMonths } from "@/lib/recurring";
import { MonthNav } from "@/components/month-nav";
import { BillPaidToggle } from "@/components/bill-paid-toggle";

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const supabase = await createClient();

  // Calendário no timezone DO USUÁRIO (RN-08) — com o default do servidor, na
  // virada do mês esta tela mostraria um mês e o dashboard, outro. A sessão não
  // depende do timezone: as duas leituras vão juntas.
  const [tz, user] = await Promise.all([sessionTimezone(supabase), getSessionUser()]);
  const refMonth = mes ?? currentReferenceMonth(tz);

  // Contas fixas recorrentes são propagadas a todos os meses: materializa
  // (idempotente) o mês exibido antes de ler, para aparecerem mesmo em meses
  // que o cron do dia 1 ainda não alcançou. Os dois meses vão no mesmo lote.
  if (user) {
    await materializeRecurringMonths(supabase, user.id, [shiftReferenceMonth(refMonth, -1), refMonth]);
  }

  // Parcelas de origem CONTA (não-cartão) da competência, já com a descrição da
  // transação e o nome/cor da conta resolvidos no banco — eram três consultas
  // (parcelas, depois transações e contas em paralelo).
  const { data: bills } = await supabase.rpc("account_bills", { p_ref_month: refMonth });

  const items = (bills ?? [])
    .map((r) => ({
      id: r.id,
      transactionId: r.transaction_id,
      description: r.description,
      kind: r.kind,
      accountName: r.account_name ?? "—",
      accountColor: r.account_color ?? "#64748b",
      amountCents: r.amount_cents,
      dueDate: r.due_date,
      paid: r.status === "paid",
    }))
    // Vencimento nulo vai para o fim da lista.
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  const total = items.reduce((s, i) => s + i.amountCents, 0);
  const paid = items.filter((i) => i.paid).reduce((s, i) => s + i.amountCents, 0);
  const open = total - paid;
  const today = todayISO(tz);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">Contas</h1>
        <HideValuesToggle />
        <Link
          href="/gastos/novo"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Lançar
        </Link>
      </div>

      <MonthNav basePath="/contas" refMonth={refMonth} />

      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="Total" value={<Money cents={total} />} />
        <SummaryTile label="Em aberto" value={<Money cents={open} />} accent="text-amber-600" />
        <SummaryTile label="Pago" value={<Money cents={paid} />} accent="text-emerald-600" />
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
                {/* O item leva ao detalhe do gasto — sem isso não havia como
                    editar nem excluir uma conta fora do cartão pela tela. */}
                <Link
                  href={`/gastos/${it.transactionId}?mes=${refMonth}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span
                    className="h-9 w-9 shrink-0 rounded-full"
                    style={{ backgroundColor: it.accountColor }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-medium ${it.paid ? "text-neutral-400 line-through" : ""}`}
                    >
                      {it.description}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {it.accountName}
                      {it.dueDate && (
                        <span className={overdue ? "text-red-600" : ""}>
                          {" "}
                          · vence {formatDayMonth(it.dueDate)}
                          {overdue ? " (vencida)" : ""}
                        </span>
                      )}
                    </span>
                  </span>
                  <Money cents={it.amountCents} className="shrink-0 font-semibold" />
                </Link>
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
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-base font-bold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
