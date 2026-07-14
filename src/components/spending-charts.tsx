"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { formatCents } from "@/lib/money";

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
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {byCategory.map((c) => (
                    <Cell key={c.name} fill={c.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCents(v)} />
              </PieChart>
            </ResponsiveContainer>
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

      {hasMonthly && (
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <h2 className="mb-2 font-semibold">Últimos meses</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthly} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                formatter={(v: number) => formatCents(v)}
                cursor={{ fill: "rgba(22,163,74,0.08)" }}
              />
              <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}
    </div>
  );
}
