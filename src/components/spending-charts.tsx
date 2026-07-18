"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatCents } from "@/lib/money";

const BRAND = "#16a34a";

function MonthlyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MonthlyBar }[];
}) {
  if (!active || !payload?.length) return null;
  const bar = payload[0].payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/95">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {bar.label}
      </p>
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        {formatCents(bar.value)}
      </p>
    </div>
  );
}

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CategorySlice }[];
}) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/95">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: slice.color }}
        />
        {slice.name}
      </p>
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        {formatCents(slice.value)}
      </p>
    </div>
  );
}

export interface CategorySlice {
  name: string;
  value: number; // centavos
  color: string;
}
export interface MonthlyBar {
  label: string;
  value: number; // centavos
}

export function SpendingCharts({
  byCategory,
  monthly,
}: {
  byCategory: CategorySlice[];
  monthly: MonthlyBar[];
}) {
  const hasCategory = byCategory.some((c) => c.value > 0);
  const hasMonthly = monthly.some((m) => m.value > 0);

  if (!hasCategory && !hasMonthly) return null;

  return (
    <div className="flex flex-col gap-4">
      {hasCategory && (
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <h2 className="mb-2 font-semibold">Gasto por categoria</h2>
          <div className="flex items-center gap-3">
            <div className="relative w-1/2">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={byCategory.filter((c) => c.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={46}
                    outerRadius={72}
                    paddingAngle={0}
                    stroke="none"
                  >
                    {byCategory
                      .filter((c) => c.value > 0)
                      .map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                  </Pie>
                  <Tooltip content={<CategoryTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  Total
                </span>
                <span className="text-sm font-bold text-neutral-900 dark:text-neutral-50">
                  {formatCents(byCategory.reduce((sum, c) => sum + c.value, 0))}
                </span>
              </div>
            </div>
            <ul className="flex-1 space-y-1 text-xs">
              {byCategory
                .filter((c) => c.value > 0)
                .sort((a, b) => b.value - a.value)
                .slice(0, 6)
                .map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="shrink-0 font-medium">{formatCents(c.value)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      )}

      {hasMonthly && <MonthlyChart monthly={monthly} />}
    </div>
  );
}

function MonthlyChart({ monthly }: { monthly: MonthlyBar[] }) {
  const lastIdx = monthly.length - 1;
  const current = monthly[lastIdx];
  const previous = monthly[lastIdx - 1];

  // variação mês a mês (competência anterior → atual)
  const delta =
    previous && previous.value > 0
      ? (current.value - previous.value) / previous.value
      : null;

  const deltaUp = delta !== null && delta > 0;
  const deltaDown = delta !== null && delta < 0;
  const DeltaIcon = deltaUp ? ArrowUpRight : deltaDown ? ArrowDownRight : Minus;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Últimos meses</h2>
          <p className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            {formatCents(current.value)}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            gasto em {current.label}
          </p>
        </div>
        {delta !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
              deltaUp
                ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                : deltaDown
                  ? "bg-brand/10 text-brand"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            <DeltaIcon size={13} strokeWidth={2.5} />
            {Math.abs(delta * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={monthly} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
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
            content={<MonthlyTooltip />}
            cursor={{ fill: "rgba(22,163,74,0.07)", radius: 6 }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44}>
            {monthly.map((m, i) => (
              <Cell
                key={m.label}
                fill={BRAND}
                fillOpacity={i === lastIdx ? 1 : 0.3}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
