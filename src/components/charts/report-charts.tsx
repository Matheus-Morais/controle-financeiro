"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { formatCents } from "@/lib/money";
import { Money } from "@/components/money";

const BRAND = "#16a34a";
const INCOME = "#0ea5e9";

export interface Slice {
  name: string;
  value: number; // centavos
  color: string;
}

export interface FlowPoint {
  label: string;
  income: number; // centavos
  spending: number; // centavos
}

/** Caixa de tooltip compartilhada — mesma moldura das duas telas de gráfico. */
function TooltipBox({ title, rows }: { title: string; rows: { label: string; cents: number }[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/95">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </p>
      {rows.map((r) => (
        <p key={r.label} className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          {r.label ? `${r.label}: ` : ""}
          <span data-money>{formatCents(r.cents)}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Entradas × saídas por competência.
 *
 * As duas barras lado a lado no mesmo mês são a leitura que o dashboard não dá:
 * lá o fluxo aparece só do mês corrente, e sem histórico não dá para ver se a
 * folga do mês foi exceção ou tendência.
 */
export function IncomeVsSpendingChart({ data }: { data: FlowPoint[] }) {
  return (
    <div data-money-chart>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="currentColor"
            strokeDasharray="3 3"
            className="text-neutral-200 dark:text-neutral-800"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            dy={4}
            className="fill-neutral-500 dark:fill-neutral-400"
          />
          <Tooltip
            cursor={{ fill: "rgba(22,163,74,0.07)", radius: 6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as FlowPoint;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: "Entradas", cents: p.income },
                    { label: "Saídas", cents: p.spending },
                    { label: "Sobra", cents: p.income - p.spending },
                  ]}
                />
              );
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            formatter={(v) => (v === "income" ? "Entradas" : "Saídas")}
          />
          <Bar dataKey="income" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={16} />
          <Bar dataKey="spending" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Série longa de gasto por competência (12 meses), com o mês atual destacado. */
export function HistoryChart({ data }: { data: { label: string; value: number }[] }) {
  const lastIdx = data.length - 1;
  return (
    <div data-money-chart>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="currentColor"
            strokeDasharray="3 3"
            className="text-neutral-200 dark:text-neutral-800"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            interval={0}
            dy={4}
            className="fill-neutral-500 dark:fill-neutral-400"
          />
          <Tooltip
            cursor={{ fill: "rgba(22,163,74,0.07)", radius: 6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { label: string; value: number };
              return <TooltipBox title={p.label} rows={[{ label: "", cents: p.value }]} />;
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((d, i) => (
              <Cell key={d.label} fill={BRAND} fillOpacity={i === lastIdx ? 1 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Donut + ranking COMPLETO das categorias.
 *
 * O dashboard corta no top 6 por falta de espaço, o que esconde justamente a
 * cauda de gastos pequenos que costuma explicar o mês.
 */
export function CategoryBreakdown({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, c) => s + c.value, 0);
  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div data-money-chart className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={92}
              paddingAngle={0}
              stroke="none"
            >
              {slices.map((c) => (
                <Cell key={c.name} fill={c.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const s = payload[0].payload as Slice;
                return <TooltipBox title={s.name} rows={[{ label: "", cents: s.value }]} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">Total</span>
          <span data-money className="text-base font-bold">
            {formatCents(total)}
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {slices.map((c) => {
          const pct = Math.round((c.value / total) * 100);
          return (
            <li key={c.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="shrink-0 text-neutral-500">
                  <Money cents={c.value} className="font-medium text-neutral-900 dark:text-neutral-50" />{" "}
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
    </div>
  );
}
