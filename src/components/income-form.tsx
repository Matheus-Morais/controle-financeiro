"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { parseBRLToCents } from "@/lib/money";

type ActionState = { error?: string } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function IncomeForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction] = useActionState(action, undefined);
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);
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
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton pendingLabel="Salvando…">Salvar recebimento</SubmitButton>
    </form>
  );
}
