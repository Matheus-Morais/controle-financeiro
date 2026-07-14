import Link from "next/link";
import { CreditCard, TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatMonthLabel } from "@/lib/date";
import { formatCents } from "@/lib/money";

export default async function DashboardPage() {
  const supabase = await createClient();
  const refMonth = currentReferenceMonth();

  const [{ data: profile }, { count: cardsCount }, { data: installments }, { data: incomes }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").single(),
      supabase.from("cards").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("installments").select("amount_cents").eq("reference_month", refMonth),
      supabase.from("incomes").select("amount_cents").eq("reference_month", refMonth),
    ]);

  const spent = (installments ?? []).reduce((s, i) => s + i.amount_cents, 0);
  const received = (incomes ?? []).reduce((s, i) => s + i.amount_cents, 0);
  const balance = received - spent;

  const firstName = profile?.display_name?.split(" ")[0] ?? "";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-neutral-500">Olá{firstName ? `, ${firstName}` : ""} 👋</p>
        <h1 className="text-2xl font-bold">{formatMonthLabel(refMonth)}</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          icon={<TrendingDown className="text-red-500" size={18} />}
          label="Gasto no mês"
          value={formatCents(spent)}
        />
        <SummaryCard
          icon={<TrendingUp className="text-brand" size={18} />}
          label="Recebido no mês"
          value={formatCents(received)}
        />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <p className="text-xs text-neutral-500">Saldo do mês (recebido − gasto)</p>
        <p className={`text-2xl font-bold ${balance < 0 ? "text-red-500" : "text-brand"}`}>
          {formatCents(balance)}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Seus cartões</h2>
          <Link href="/cartoes" className="text-sm font-medium text-brand">
            Ver todos
          </Link>
        </div>
        {cardsCount ? (
          <p className="text-sm text-neutral-500">
            {cardsCount} cartão(ões) ativo(s). Abra a aba Cartões para ver as faturas.
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

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
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
