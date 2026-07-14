"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { Card } from "@/types/database";

type ActionState = { error?: string } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const COLORS = ["#16a34a", "#0ea5e9", "#8b5cf6", "#ef4444", "#f97316", "#ec4899", "#64748b"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar cartão"}
    </button>
  );
}

export function CardForm({ action, card }: { action: Action; card?: Card }) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Nome do cartão
        <input
          name="name"
          required
          defaultValue={card?.name}
          placeholder="Ex.: Nubank"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Bandeira (opcional)
        <input
          name="brand"
          defaultValue={card?.brand ?? ""}
          placeholder="Ex.: Mastercard"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Dia de fechamento
          <input
            name="closing_day"
            type="number"
            min={1}
            max={31}
            required
            defaultValue={card?.closing_day}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Dia de vencimento
          <input
            name="due_day"
            type="number"
            min={1}
            max={31}
            required
            defaultValue={card?.due_day}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Últimos 4 dígitos (opcional)
        <input
          name="last_four"
          inputMode="numeric"
          maxLength={4}
          defaultValue={card?.last_four ?? ""}
          placeholder="1234"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <fieldset className="flex flex-col gap-2 text-sm">
        Cor
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c, i) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="color"
                value={c}
                defaultChecked={card ? card.color === c : i === 0}
                className="peer sr-only"
              />
              <span
                className="block h-8 w-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-neutral-900 dark:peer-checked:ring-white"
                style={{ backgroundColor: c }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
