import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatMonthLabel, shortMonthLabel } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { getSessionUser } from "@/lib/auth";
import { materializeRecurringMonths } from "@/lib/recurring";
import {
  monthlyIncomeTotals,
  monthlyTotals,
  spendingByCard,
  spendingByCategory,
} from "@/lib/reports";
import { Money } from "@/components/money";
import { HideValuesToggle } from "@/components/hide-values-toggle";
import { MonthNav } from "@/components/month-nav";
import {
  CategoryBreakdown,
  HistoryChart,
  IncomeVsSpendingChart,
  type Slice,
} from "@/components/charts/report-charts";

/** Quantos meses de histórico as séries longas cobrem. */
const HISTORY_MONTHS = 12;

/**
 * Tela de gráficos.
 *
 * O dashboard mostra o mês corrente e cabe num polegar: donut de 160px e as
 * seis maiores categorias. Aqui é o oposto — histórico longo, ranking completo e
 * os recortes que não cabiam lá (entradas × saídas mês a mês, gasto por cartão).
 *
 * Tudo por COMPETÊNCIA, como os gráficos do dashboard: o que foi lançado no mês.
 */
export default async function GraficosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const supabase = await createClient();

  const [tz, user] = await Promise.all([sessionTimezone(supabase), getSessionUser()]);
  const month = mes ?? currentReferenceMonth(tz);

  // Mesmo cuidado das outras telas que mostram um mês: sem materializar, as
  // assinaturas que o cron do dia 1 ainda não alcançou faltariam nos gráficos.
  if (user) {
    await materializeRecurringMonths(supabase, user.id, [month]);
  }

  const [spending, monthly, income, byCard, { data: categories }] = await Promise.all([
    spendingByCategory(supabase, month),
    monthlyTotals(supabase, month, HISTORY_MONTHS),
    monthlyIncomeTotals(supabase, month, HISTORY_MONTHS),
    spendingByCard(supabase, month),
    supabase.from("categories").select("id, name, color"),
  ]);

  // Ranking completo (o dashboard corta no top 6), sem as categorias zeradas.
  const slices: Slice[] = [
    ...(categories ?? []).map((c) => ({
      name: c.name,
      value: spending.get(c.id) ?? 0,
      color: c.color ?? "#94a3b8",
    })),
    ...(spending.get("none")
      ? [{ name: "Sem categoria", value: spending.get("none")!, color: "#cbd5e1" }]
      : []),
  ]
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  const history = monthly.map((m) => ({ label: shortMonthLabel(m.month), value: m.cents }));
  const incomeByMonth = new Map(income.map((i) => [i.month, i.cents]));
  const flow = monthly.map((m) => ({
    label: shortMonthLabel(m.month),
    income: incomeByMonth.get(m.month) ?? 0,
    spending: m.cents,
  }));

  const monthSpending = spending.size
    ? [...spending.values()].reduce((s, v) => s + v, 0)
    : 0;
  const cardTotal = byCard.reduce((s, c) => s + c.cents, 0);
  const hasAnything = history.some((h) => h.value > 0) || flow.some((f) => f.income > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">Gráficos</h1>
        <HideValuesToggle className="-mr-2" />
      </div>

      <MonthNav basePath="/graficos" refMonth={month} />

      {hasAnything ? (
        <div key={month} className="flex flex-col gap-4 animate-month-in motion-reduce:animate-none">
          <Card
            title="Entradas × saídas"
            hint={`Últimos ${HISTORY_MONTHS} meses, por competência`}
          >
            <IncomeVsSpendingChart data={flow} />
          </Card>

          <Card title="Evolução dos gastos" hint={`Últimos ${HISTORY_MONTHS} meses`}>
            <HistoryChart data={history} />
          </Card>

          <Card
            title="Por categoria"
            hint={formatMonthLabel(month)}
            value={<Money cents={monthSpending} />}
          >
            {slices.length > 0 ? (
              <CategoryBreakdown slices={slices} />
            ) : (
              <p className="py-6 text-center text-sm text-neutral-500">
                Nada lançado neste mês.
              </p>
            )}
          </Card>

          <Card title="Por cartão" hint={formatMonthLabel(month)}>
            {byCard.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {byCard.map((c) => {
                  const pct = cardTotal > 0 ? Math.round((c.cents / cardTotal) * 100) : 0;
                  return (
                    <li key={c.cardId} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-neutral-500">
                          <Money
                            cents={c.cents}
                            className="font-medium text-neutral-900 dark:text-neutral-50"
                          />{" "}
                          · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: c.color }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-neutral-500">
                Nenhum gasto em cartão neste mês.
              </p>
            )}
          </Card>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-neutral-500">
          <CreditCard size={28} className="text-neutral-300" />
          <p>Ainda não há dados para desenhar.</p>
          <p className="text-xs">
            Lance alguns gastos e recebimentos — os gráficos aparecem a partir da primeira
            competência com movimento.
          </p>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  hint,
  value,
  children,
}: {
  title: string;
  hint?: string;
  value?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
        {value && <p className="shrink-0 text-lg font-bold">{value}</p>}
      </div>
      {children}
    </section>
  );
}
