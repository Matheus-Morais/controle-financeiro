"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";
import { changeRecurringCard } from "@/app/(app)/recorrentes/actions";

interface Card {
  id: string;
  name: string;
}

interface Props {
  recurringId: string;
  description: string;
  currentCardId: string | null;
  /** Rótulo do mês corrente, ex.: "Julho de 2026". */
  monthLabel: string;
  cards: Card[];
}

export function ChangeCardModal({
  recurringId,
  description,
  currentCardId,
  monthLabel,
  cards,
}: Props) {
  const options = cards.filter((c) => c.id !== currentCardId);
  const [open, setOpen] = useState(false);
  const [newCardId, setNewCardId] = useState(options[0]?.id ?? "");
  const [charged, setCharged] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Sem outro cartão para onde mover: não faz sentido oferecer a troca.
  if (options.length === 0) return null;

  function handleConfirm() {
    if (!newCardId) {
      setError("Selecione o cartão de destino.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await changeRecurringCard(recurringId, newCardId, charged);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Trocar cartão"
        aria-label="Trocar cartão"
        className="p-2 text-neutral-400 transition hover:text-brand disabled:opacity-50"
      >
        <ArrowLeftRight size={18} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900">
            <h2 className="mb-1 font-semibold">Trocar cartão</h2>
            <p className="mb-4 truncate text-sm text-neutral-500">{description}</p>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                Novo cartão
                <select
                  value={newCardId}
                  onChange={(e) => setNewCardId(e.target.value)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800"
                >
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1">
                  {monthLabel} já foi cobrado no cartão atual?
                </legend>
                <label className="flex items-start gap-2 rounded-xl border border-neutral-300 p-3 dark:border-neutral-700">
                  <input
                    type="radio"
                    name="charged"
                    checked={charged}
                    onChange={() => setCharged(true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Sim, já foi cobrado</span>
                    <span className="block text-xs text-neutral-500">
                      {monthLabel} continua no cartão atual; o novo assume a partir do
                      próximo mês.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-xl border border-neutral-300 p-3 dark:border-neutral-700">
                  <input
                    type="radio"
                    name="charged"
                    checked={!charged}
                    onChange={() => setCharged(false)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Ainda não foi cobrado</span>
                    <span className="block text-xs text-neutral-500">
                      {monthLabel} já vai para o novo cartão.
                    </span>
                  </span>
                </label>
              </fieldset>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-neutral-300 py-3 text-sm font-semibold dark:border-neutral-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={pending}
                  className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Salvando…" : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
