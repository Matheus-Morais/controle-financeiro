"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Wallet } from "lucide-react";
import { formatCents, parseBRLToCents } from "@/lib/money";
import { saveOnboardingIncome } from "@/app/onboarding/actions";

type IncomeSummary = { id: string; description: string; amountCents: number };
type ActionState = { error?: string; income?: IncomeSummary } | undefined;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="flex items-center justify-center gap-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      <Plus size={16} /> {pending ? "Adicionando…" : "Adicionar renda"}
    </button>
  );
}

export function StepIncome({
  today,
  incomes,
  onIncomesChange,
  onNext,
  onBack,
}: {
  today: string;
  incomes: IncomeSummary[];
  onIncomesChange: (incomes: IncomeSummary[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveOnboardingIncome, undefined);
  const [amount, setAmount] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const cents = useMemo(() => parseBRLToCents(amount), [amount]);

  useEffect(() => {
    if (state?.income) {
      onIncomesChange([...incomes, state.income]);
      formRef.current?.reset();
      setAmount("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-2xl font-bold">Suas rendas mensais</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Cadastre quantas quiser, uma de cada vez. Se preferir, pule e cadastre depois em Recebimentos.
      </p>

      {incomes.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {incomes.map((i) => (
            <div
              key={i.id}
              className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
            >
              <Wallet size={16} className="shrink-0 text-brand" />
              <span className="flex-1 text-sm font-medium">{i.description}</span>
              <span className="text-sm font-semibold">{formatCents(i.amountCents)}</span>
            </div>
          ))}
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900"
      >
        <input type="hidden" name="receipt_date" value={today} />
        <input type="hidden" name="recurring_mode" value="day_of_month" />
        <input type="hidden" name="amount_cents" value={cents ?? ""} />

        <label className="flex flex-col gap-1 text-sm">
          Descrição
          <input
            name="description"
            required
            defaultValue="Salário"
            placeholder="Ex.: Salário"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Valor por mês
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="R$ 0,00"
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-lg dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Dia do recebimento
            <input
              name="recurring_day"
              type="number"
              min={1}
              max={31}
              defaultValue={5}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton disabled={!cents || cents <= 0} />
      </form>

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
          onClick={onNext}
          className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98]"
        >
          {incomes.length > 0 ? "Continuar" : "Pular por agora"}
        </button>
      </div>
    </div>
  );
}
