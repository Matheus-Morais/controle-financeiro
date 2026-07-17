"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { parseBRLToCents } from "@/lib/money";
import { saveOnboardingIncome } from "@/app/onboarding/actions";

type ActionState = { error?: string; ok?: boolean; amountCents?: number } | undefined;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar e continuar"}
    </button>
  );
}

export function StepIncome({
  today,
  onNext,
  onBack,
}: {
  today: string;
  onNext: (amountCents: number | null) => void;
  onBack: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveOnboardingIncome, undefined);
  const [amount, setAmount] = useState("");
  const cents = useMemo(() => parseBRLToCents(amount), [amount]);

  useEffect(() => {
    if (state?.ok) onNext(state.amountCents ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-2xl font-bold">Qual sua renda mensal?</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Isso ajuda a saber quanto sobra depois das contas e cartões. Pode pular e informar depois.
      </p>

      <form action={formAction} className="mt-6 flex flex-1 flex-col gap-4">
        <input type="hidden" name="description" value="Salário" />
        <input type="hidden" name="receipt_date" value={today} />
        <input type="hidden" name="recurring_mode" value="day_of_month" />
        <input type="hidden" name="amount_cents" value={cents ?? ""} />

        <label className="flex flex-col gap-1 text-sm">
          Valor recebido por mês
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="R$ 0,00"
            autoFocus
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Dia do mês em que costuma receber
          <input
            name="recurring_day"
            type="number"
            min={1}
            max={31}
            defaultValue={5}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div className="mt-auto flex items-center gap-3 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium dark:border-neutral-700"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => onNext(null)}
            className="px-2 text-sm font-medium text-neutral-500 underline-offset-2 hover:underline"
          >
            Pular
          </button>
          <SubmitButton disabled={!cents || cents <= 0} />
        </div>
      </form>
    </div>
  );
}
