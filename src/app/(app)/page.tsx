import Link from "next/link";
import { CreditCard, PiggyBank, Repeat, Target, TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatMonthLabel, shortMonthLabel } from "@/lib/date";
import { spendingByCategory, monthlyTotals } from "@/lib/reports";
import { formatCents } from "@/lib/money";
import { SpendingCharts, type CategorySlice } from "@/components/spending-charts";

export default async function DashboardPage() {
  const supabase = await createClient();
  const refMonth = currentReferenceMonth();

  const [{ data: profile }, { data: cards }, { data: categories }, { data: incomes }, { data: openInvoices }, spending, monthly] =
    await Promise.all([
      supabase.from("profiles").select("display_name").single(),
      supabase.from("cards").select("id, name").eq("active", true),
      supabase.from("categories").select("id, name, color"),
      supabase.from("incomes").select("amount_cents").eq("reference_month", refMonth),
      supabase
        .from("invoices")
        .select("id, card_id, reference_month, due_date")
        .eq("status", "open")
        .order("due_date")
        .limit(6),
      spendingByCategory(supabase, refMonth),
      monthlyTotals(supabase, refMonth, 6),
    ]);

  const spent = [...spending.values()].reduce((s, v) => s + v, 0);
  const received = (incomes ?? []).reduce((s, i) => s + i.amount_cents, 0);
  const balance = received - spent;
  const cardName = new Map((cards ?? []).map((c) => [c.id, c.name]));

  // Fatias do gráfico por categoria
  const byCategory: CategorySlice[] = [
    ...(categories ?? []).map((c) => ({
      name: c.name,
      value: spending.get(c.id) ?? 0,
      color: c.color ?? "#94a3b8",
    })),
    ...(spending.get("none") ? [{ name: "Sem categoria", value: spending.get("none")!, color: "#cbd5e1" }] : []),
  ];
  const monthlyBars = monthly.map((m) => ({ label: shortMonthLabel(m.month), value: m.cents }));

  // Total de cada fatura em aberto
  const invoiceTotals = new Map<string, number>();
  if (openInvoices?.length) {
    const { data: allInst } = await supabase
      .from("installments")
      .select("card_id, reference_month, amount_cents")
      .in("card_id", [...new Set(openInvoices.map((i) => i.card_id))]);
    for (const it of allInst ?? []) {
      const key = `${it.card_id}|${it.reference_month}`;
      invoiceTotals.set(key, (invoiceTotals.get(key) ?? 0) + it.amount_cents);
    }
  }

  const firstName = profile?.display_name?.split(" ")[0] ?? "";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-neutral-500">Olá{firstName ? `, ${firstName}` : ""} 👋</p>
        <h1 className="text-2xl font-bold">{formatMonthLabel(refMonth)}</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <SummaryCard icon={<TrendingDown className="text-red-500" size={18} />} label="Gasto no mês" value={formatCents(spent)} />
        <SummaryCard icon={<TrendingUp className="text-brand" size={18} />} label="Recebido no mês" value={formatCents(received)} />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <p className="text-xs text-neutral-500">Saldo do mês (recebido − gasto)</p>
        <p className={`text-2xl font-bold ${balance < 0 ? "text-red-500" : "text-brand"}`}>{formatCents(balance)}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <QuickLink href="/recebimentos" icon={<PiggyBank size={20} />} label="Renda" />
        <QuickLink href="/recorrentes" icon={<Repeat size={20} />} label="Recorrentes" />
        <QuickLink href="/orcamento" icon={<Target size={20} />} label="Orçamento" />
      </div>

      <SpendingCharts byCategory={byCategory} monthly={monthlyBars} />

      {openInvoices && openInvoices.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Faturas em aberto</h2>
          <ul className="flex flex-col gap-2">
            {openInvoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/cartoes/${inv.card_id}?mes=${inv.reference_month}`}
                  className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
                >
                  <div>
                    <p className="font-medium">{cardName.get(inv.card_id) ?? "Cartão"}</p>
                    <p className="text-xs text-neutral-500">vence em {inv.due_date.split("-").reverse().join("/")}</p>
                  </div>
                  <span className="font-semibold">
                    {formatCents(invoiceTotals.get(`${inv.card_id}|${inv.reference_month}`) ?? 0)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold">{value}</p>
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
