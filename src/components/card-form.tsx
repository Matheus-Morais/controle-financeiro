"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { CARD_COLORS } from "@/lib/card-colors";
import type { Card } from "@/types/database";

type ActionState = { error?: string } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function CardForm({ action, card }: { action: Action; card?: Card }) {
  const [state, formAction] = useActionState(action, undefined);

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
        <div className="flex flex-wrap gap-2.5">
          {CARD_COLORS.map((c, i) => (
            <label key={c.hex} className="cursor-pointer" title={c.name}>
              <input
                type="radio"
                name="color"
                value={c.hex}
                aria-label={c.name}
                defaultChecked={card ? card.color === c.hex : i === 0}
                className="peer sr-only"
              />
              <span
                className="block h-8 w-8 rounded-full ring-offset-2 ring-offset-neutral-50 transition peer-checked:ring-2 peer-checked:ring-neutral-900 peer-hover:scale-110 dark:ring-offset-neutral-950 dark:peer-checked:ring-white"
                style={{ backgroundColor: c.hex }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton pendingLabel="Salvando…">Salvar cartão</SubmitButton>
    </form>
  );
}
