"use client";

import { useTransition } from "react";
import Link from "next/link";
import { FileUp, PartyPopper } from "lucide-react";
import { formatCents } from "@/lib/money";
import { completeOnboarding } from "@/app/onboarding/actions";

export function StepFinal({
  incomeCents,
  cardsCount,
  categoriesCount,
  budgetedCount,
}: {
  incomeCents: number | null;
  cardsCount: number;
  categoriesCount: number;
  budgetedCount: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/10">
        <PartyPopper size={40} className="text-brand" />
      </span>
      <div>
        <h1 className="text-2xl font-bold">Tudo pronto!</h1>
        <p className="mt-2 text-neutral-500">Este é o resumo da sua configuração inicial:</p>
      </div>

      <ul className="flex w-full flex-col gap-2 text-left text-sm">
        <li className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900">
          <span>Renda mensal</span>
          <span className="font-semibold">
            {incomeCents ? formatCents(incomeCents) : "não informada"}
          </span>
        </li>
        <li className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900">
          <span>Cartões cadastrados</span>
          <span className="font-semibold">{cardsCount}</span>
        </li>
        <li className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900">
          <span>Categorias</span>
          <span className="font-semibold">{categoriesCount}</span>
        </li>
        <li className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900">
          <span>Metas de orçamento</span>
          <span className="font-semibold">
            {budgetedCount > 0 ? `${budgetedCount} categoria(s)` : "nenhuma"}
          </span>
        </li>
      </ul>

      {cardsCount > 0 && (
        <Link href="/gastos/importar" className="flex items-center gap-2 text-sm font-medium text-brand">
          <FileUp size={16} /> Importar sua primeira fatura em PDF
        </Link>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => completeOnboarding())}
        className="w-full rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Ir para o Dashboard"}
      </button>
    </div>
  );
}
