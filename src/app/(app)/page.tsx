import Link from "next/link";
import { CreditCard, PiggyBank, Receipt, Repeat, Target, TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  currentReferenceMonth,
  formatDayMonth,
  shortMonthLabel,
  todayISO,
} from "@/lib/date";
import { monthCashFlow, monthlyTotals, spendingByCategory } from "@/lib/reports";
import { formatCents } from "@/lib/money";
import { SpendingCharts, type CategorySlice } from "@/components/spending-charts";
import { MonthNav } from "@/components/month-nav";
import type { InvoiceState } from "@/lib/invoice";

const DEFAULT_TZ = "America/Sao_Paulo";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const supabase = await createClient();
  const { mes } = await searchParams;

  // O timezone do usuário decide o "hoje" e o mês corrente (default de fallback).
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .single();
  const tz = profile?.timezone ?? DEFAULT_TZ;
  const today = todayISO(tz);
  const month = mes ?? currentReferenceMonth(tz);

  const [{ data: cards }, { data: categories }, spending, monthly, flow] = await Promise.all([
    supabase.from("cards").select("id, name").eq("active", true),
    supabase.from("categories").select("id, name, color"),
    spendingByCategory(supabase, month),
    monthlyTotals(supabase, month, 6),
    monthCashFlow(supabase, month, today),
  ]);

  // Gráficos permanecem por COMPETÊNCIA (o que foi lançado no mês).
  const byCategory: CategorySlice[] = [
    ...(categories ?? []).map((c) => ({
      name: c.name,
      value: spending.get(c.id) ?? 0,
      color: c.color ?? "#94a3b8",
    })),
    ...(spending.get("none") ? [{ name: "Sem categoria", value: spending.get("none")!, color: "#cbd5e1" }] : []),
  ];
  const monthlyBars = monthly.map((m) => ({ label: shortMonthLabel(m.month), value: m.cents }));
  const hasChartData = byCategory.some((c) => c.value > 0) || monthlyBars.some((m) => m.value > 0);

  const firstName = profile?.display_name?.split(" ")[0] ?? "";
  const nothingThisMonth =
    flow.income === 0 && flow.toPay === 0 && flow.invoicesDue.length === 0 && !hasChartData;

  // Detalhamento do "a pagar": faturas + à vista.
  const payHintParts: string[] = [];
  if (flow.invoicesTotal > 0) payHintParts.push(`${formatCents(flow.invoicesTotal)} em faturas`);
  if (flow.cashSpending > 0) payHintParts.push(`${formatCents(flow.cashSpending)} à vista`);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-neutral-500">Olá{firstName ? `, ${firstName}` : ""} 👋</p>
        <h1 className="text-2xl font-bold">Resumo do mês</h1>
      </header>

      <MonthNav basePath="/" refMonth={month} />

      <div key={month} className="flex flex-col gap-6 animate-month-in motion-reduce:animate-none">
        {/* Fluxo de caixa do mês */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard
            icon={<TrendingUp className="text-brand" size={18} />}
            label="Entradas"
            value={formatCents(flow.income)}
          />
          <SummaryCard
            icon={<TrendingDown className="text-red-500" size={18} />}
            label="A pagar no mês"
            value={formatCents(flow.toPay)}
            hint={payHintParts.join(" + ") || undefined}
          />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <p className="text-xs text-neutral-500">Sobra do mês (entradas − a pagar)</p>
          <p className={`text-3xl font-bold ${flow.leftover < 0 ? "text-red-500" : "text-brand"}`}>
            {formatCents(flow.leftover)}
          </p>
        </div>

        {nothingThisMonth && (
          <p className="py-4 text-center text-sm text-neutral-500">Sem movimentações neste mês.</p>
        )}

        {/* Faturas cujo vencimento cai neste mês */}
        {flow.invoicesDue.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Faturas a pagar</h2>
            <ul className="flex flex-col gap-2">
              {flow.invoicesDue.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/cartoes/${inv.cardId}?mes=${inv.referenceMonth}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: inv.cardColor }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{inv.cardName}</p>
                        <p className="text-xs text-neutral-500">vence em {formatDayMonth(inv.dueDate)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold">{formatCents(inv.totalCents)}</span>
                      <InvoiceStateBadge state={inv.state} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Gráficos por competência (o que foi lançado no mês) */}
        {hasChartData && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-neutral-500">Gastos lançados no mês (competência)</p>
            <SpendingCharts byCategory={byCategory} monthly={monthlyBars} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <QuickLink href="/recebimentos" icon={<PiggyBank size={20} />} label="Renda" />
        <QuickLink href="/contas" icon={<Receipt size={20} />} label="Contas" />
        <QuickLink href="/recorrentes" icon={<Repeat size={20} />} label="Recorrentes" />
        <QuickLink href="/orcamento" icon={<Target size={20} />} label="Orçamento" />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Seus cartões</h2>
          <Link href="/cartoes" className="text-sm font-medium text-brand">
            Ver todos
          </Link>
        </div>
        {cards && cards.length > 0 ? (
          <p className="text-sm text-neutral-500">
            {cards.length} cartão(ões) ativo(s). Abra a aba Cartões para ver as faturas.
          </p>
        ) : (
          <Link
            href="/cartoes/novo"
            className="flex items-center gap-3 rounded-2xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700"
          >
            <CreditCard className="text-brand" />
            <span className="text-sm">Cadastre seu primeiro cartão para começar.</span>
          </Link>
        )}
      </section>
    </div>
  );
}

const STATE_STYLES: Record<InvoiceState, { label: string; className: string }> = {
  paid: { label: "Paga", className: "bg-brand/10 text-brand" },
  to_pay: {
    label: "A pagar",
    className: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  forecast: {
    label: "Prevista",
    className: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

function InvoiceStateBadge({ state }: { state: InvoiceState }) {
  const { label, className } = STATE_STYLES[state];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{label}</span>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-3 text-brand shadow-sm dark:bg-neutral-900"
    >
      {icon}
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{label}</span>
    </Link>
  );
}
