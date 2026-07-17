"use client";

import { useState, useTransition } from "react";
import { formatCents, parseBRLToCents } from "@/lib/money";
import { Spinner } from "@/components/loader";
import { saveBudget } from "@/app/(app)/orcamento/actions";

export function BudgetRow({
  categoryId,
  name,
  color,
  spentCents,
  initialLimitCents,
}: {
  categoryId: string;
  name: string;
  color: string;
  spentCents: number;
  initialLimitCents: number;
}) {
  const [limit, setLimit] = useState(initialLimitCents > 0 ? String(initialLimitCents / 100).replace(".", ",") : "");
  const [savedLimit, setSavedLimit] = useState(initialLimitCents);
  const [pending, startTransition] = useTransition();

  const pct = savedLimit > 0 ? Math.min(100, Math.round((spentCents / savedLimit) * 100)) : 0;
  const over = savedLimit > 0 && spentCents > savedLimit;

  function commit() {
    const cents = parseBRLToCents(limit) ?? 0;
    if (cents === savedLimit) return;
    setSavedLimit(cents);
    startTransition(() => saveBudget(categoryId, cents));
  }

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          {name}
        </span>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-neutral-400">meta R$</span>
          <input
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={commit}
            placeholder="0,00"
            className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-right dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
        <span>
          Gasto: <b className={over ? "text-red-500" : ""}>{formatCents(spentCents)}</b>
          {savedLimit > 0 && ` de ${formatCents(savedLimit)}`}
        </span>
        {pending && (
          <span className="flex items-center gap-1 text-neutral-400">
            <Spinner size={12} /> salvando…
          </span>
        )}
      </div>

      {savedLimit > 0 && (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand"}`}
            style={{ width: `${over ? 100 : pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
