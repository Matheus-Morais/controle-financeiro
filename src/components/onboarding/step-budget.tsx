"use client";

import { useState, useTransition } from "react";
import { parseBRLToCents } from "@/lib/money";
import { saveBudget } from "@/app/(app)/orcamento/actions";
import type { ManagedCategory } from "@/components/category-manager";

function BudgetInputRow({
  category,
  onSaved,
}: {
  category: ManagedCategory;
  onSaved: (categoryId: string, hasValue: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function commit() {
    const cents = parseBRLToCents(value) ?? 0;
    startTransition(() => saveBudget(category.id, cents));
    onSaved(category.id, cents > 0);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color ?? "#94a3b8" }} />
      <span className="flex-1 text-sm font-medium">{category.name}</span>
      <div className="flex items-center gap-1 text-sm">
        <span className="text-neutral-400">R$</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          placeholder="0,00"
          className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-right dark:border-neutral-700 dark:bg-neutral-950"
        />
      </div>
      {pending && <span className="w-4 text-xs text-neutral-400">…</span>}
    </div>
  );
}

export function StepBudget({
  categories,
  onNext,
  onBack,
}: {
  categories: ManagedCategory[];
  onNext: (budgetedCount: number) => void;
  onBack: () => void;
}) {
  const [budgeted, setBudgeted] = useState<Set<string>>(new Set());

  function handleSaved(categoryId: string, hasValue: boolean) {
    setBudgeted((prev) => {
      const next = new Set(prev);
      if (hasValue) next.add(categoryId);
      else next.delete(categoryId);
      return next;
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-2xl font-bold">Defina um orçamento</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Opcional: estabeleça um teto mensal para as categorias que quiser acompanhar de perto.
      </p>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        {categories.map((c) => (
          <BudgetInputRow key={c.id} category={c} onSaved={handleSaved} />
        ))}
        {categories.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
            Nenhuma categoria cadastrada ainda.
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center gap-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium dark:border-neutral-700"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={() => onNext(budgeted.size)}
          className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98]"
        >
          {budgeted.size > 0 ? "Concluir" : "Pular e concluir"}
        </button>
      </div>
    </div>
  );
}
