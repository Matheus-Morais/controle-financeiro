"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { parseBRLToCents } from "@/lib/money";

type ActionState = { error?: string } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
interface Option {
  id: string;
  name: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar assinatura"}
    </button>
  );
}

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
          placeholder="Ex.: Netflix"
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
        <select
          name="source"
          defaultValue={defaultSource}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {cards.length > 0 && (
            <optgroup label="Cartões">
              {cards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {accounts.length > 0 && (
            <optgroup label="Carteira / conta">
              {accounts.map((a) => (
                <option key={a.id} value={`account:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
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
        <select
          name="category_id"
          defaultValue=""
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
