"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/loader";
import { createCardInline } from "@/app/(app)/cartoes/actions";

interface Card {
  id: string;
  name: string;
  last_four: string | null;
}

const inputClass =
  "rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

/**
 * Confirmação de cartão antes de gravar a importação. Só é chamada quando o
 * cartão da tela de revisão NÃO veio de um match confiável pelos últimos 4
 * dígitos do PDF (ver cardConfident em import-invoice.tsx) — é o ponto exato
 * em que o usuário esquece de trocar o cartão errado.
 */
export function ConfirmCardModal({
  cards,
  cardId,
  onChangeCardId,
  detectedDigits,
  onConfirm,
  onCancel,
  onCardCreated,
}: {
  cards: Card[];
  cardId: string;
  onChangeCardId: (id: string) => void;
  detectedDigits: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onCardCreated: (card: Card) => void;
}) {
  const [creatingCard, setCreatingCard] = useState(false);
  const [name, setName] = useState("");
  const [lastFour, setLastFour] = useState(detectedDigits ?? "");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");

  const [createState, createAction, creating] = useActionState(createCardInline, undefined);
  const created = useRef(false);

  useEffect(() => {
    if (createState?.ok && createState.card && !created.current) {
      created.current = true;
      onCardCreated(createState.card);
      setCreatingCard(false);
    }
  }, [createState, onCardCreated]);

  function handleCreateCard(e: React.FormEvent) {
    e.preventDefault();
    created.current = false;
    createAction({ name, last_four: lastFour, closing_day: closingDay, due_day: dueDay });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-neutral-900">
        {!creatingCard ? (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold">Confirme o cartão</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {detectedDigits
                  ? `A fatura mostra o cartão ••${detectedDigits}, mas não achamos esse cartão cadastrado. Confira antes de importar:`
                  : "Não conseguimos identificar o cartão pelo PDF. Confira se é este mesmo antes de importar:"}
              </p>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              Cartão
              <select
                value={cardId}
                onChange={(e) => onChangeCardId(e.target.value)}
                className={inputClass}
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.last_four ? ` ••${c.last_four}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setCreatingCard(true)}
              className="text-left text-sm font-medium text-brand"
            >
              + Cadastrar novo cartão
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold dark:border-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!cardId}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60"
              >
                Confirmar e importar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateCard} className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">Novo cartão</h2>

            <label className="flex flex-col gap-1 text-sm">
              Nome do cartão
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ex.: Nubank"
                className={inputClass}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Dia de fechamento
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={closingDay}
                  onChange={(e) => setClosingDay(e.target.value)}
                  required
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Dia de vencimento
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  required
                  className={inputClass}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              Últimos 4 dígitos (opcional)
              <input
                inputMode="numeric"
                maxLength={4}
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value)}
                placeholder="1234"
                className={inputClass}
              />
            </label>

            {createState?.error && <p className="text-sm text-red-600">{createState.error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCreatingCard(false)}
                className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold dark:border-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60"
              >
                {creating && <Spinner size={18} />}
                {creating ? "Salvando…" : "Salvar cartão"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
