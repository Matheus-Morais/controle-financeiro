"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { parseBRLToCents } from "@/lib/money";

type ActionState = { error?: string } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type RecurringMode = "day_of_month" | "nth_business_day";

export function IncomeForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction] = useActionState(action, undefined);
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [mode, setMode] = useState<RecurringMode>("day_of_month");
  const cents = useMemo(() => parseBRLToCents(amount) ?? 0, [amount]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Descrição
        <input
          name="description"
          required
          placeholder="Ex.: Salário"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Valor
        <input
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input type="hidden" name="amount_cents" value={cents} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Data do recebimento
        <input
          name="receipt_date"
          type="date"
          required
          defaultValue={today}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <label className="flex items-center justify-between text-sm">
        Recebimento recorrente (todo mês)
        <input
          type="checkbox"
          name="is_recurring"
          value="true"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
        />
      </label>

      {recurring && (
        <>
          <input type="hidden" name="recurring_mode" value={mode} />
          <fieldset className="flex flex-col gap-2 text-sm">
            Quando recebe todo mês
            <div className="flex gap-2">
              {(
                [
                  ["day_of_month", "Dia fixo"],
                  ["nth_business_day", "Dia útil"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex-1">
                  <input
                    type="radio"
                    name="recurring_mode_radio"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="peer sr-only"
                  />
                  <span className="block cursor-pointer rounded-xl border border-neutral-300 py-2.5 text-center peer-checked:border-brand peer-checked:bg-brand/10 peer-checked:font-semibold peer-checked:text-brand dark:border-neutral-700">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {mode === "day_of_month" ? (
            <label className="flex flex-col gap-1 text-sm">
              Dia do recebimento (1–31)
              <input
                name="recurring_day"
                type="number"
                min={1}
                max={31}
                placeholder="Ex.: 5"
                className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              Qual dia útil (ex.: 5 = 5º dia útil)
              <input
                name="recurring_business_day"
                type="number"
                min={1}
                max={23}
                defaultValue={5}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
              />
              <span className="text-xs text-neutral-500">
                Calculado todo mês, pulando fins de semana e feriados nacionais.
              </span>
            </label>
          )}
        </>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton pendingLabel="Salvando…">Salvar recebimento</SubmitButton>
    </form>
  );
}
