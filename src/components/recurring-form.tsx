"use client";

import { useActionState, useMemo, useState } from "react";
import { Select } from "@/components/select";
import { categoryOptions, sourceOptions, type Option } from "@/components/form-options";
import { SubmitButton } from "@/components/submit-button";
import { parseBRLToCents } from "@/lib/money";

type ActionState = { error?: string } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function RecurringForm({
  action,
  cards,
  accounts,
  categories,
  currentMonth,
}: {
  action: Action;
  cards: Option[];
  accounts: Option[];
  categories: Option[];
  currentMonth: string; // YYYY-MM
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [amount, setAmount] = useState("");
  const cents = useMemo(() => parseBRLToCents(amount) ?? 0, [amount]);

  const defaultSource =
    cards[0] ? `card:${cards[0].id}` : accounts[0] ? `account:${accounts[0].id}` : "";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Descrição
        <input
          name="description"
          required
          placeholder="Ex.: Netflix, Luz, Internet"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Valor mensal
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
        Cobrado em
        <Select
          name="source"
          defaultValue={defaultSource}
          title="Cobrado em"
          ariaLabel="Cobrado em"
          options={sourceOptions(cards, accounts)}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Dia da cobrança
          <input
            name="billing_day"
            type="number"
            min={1}
            max={31}
            required
            defaultValue={1}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          A partir de
          <input
            name="start_month"
            type="month"
            required
            defaultValue={currentMonth}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Categoria (opcional)
        <Select
          name="category_id"
          defaultValue=""
          title="Categoria"
          ariaLabel="Categoria"
          options={categoryOptions(categories)}
        />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton pendingLabel="Salvando…">Salvar assinatura</SubmitButton>
    </form>
  );
}
