"use client";

import { useState, useTransition } from "react";
import { RepeatIcon } from "lucide-react";
import { criarRecorrenteDeTransacao } from "@/app/(app)/recorrentes/actions";
import { formatCents } from "@/lib/money";

interface Props {
  transactionId: string;
  description: string;
  amountCents: number;
  purchaseDate: string; // YYYY-MM-DD
  currentMonth: string; // YYYY-MM-01
}

export function ConvertToRecurringButton({
  transactionId,
  description,
  amountCents,
  purchaseDate,
  currentMonth,
}: Props) {
  const [open, setOpen] = useState(false);
  const [billingDay, setBillingDay] = useState(parseInt(purchaseDate.slice(8, 10), 10));
  const [startMonth, setStartMonth] = useState(currentMonth.slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await criarRecorrenteDeTransacao(transactionId, billingDay, startMonth);
      if (result.error) {
        setError(result.error);
      } else {
        setDone(true);
        setOpen(false);
      }
    });
  }

  if (done) {
    return (
      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        ✓ Recorrente criado
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        title="Tornar recorrente"
        className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-brand active:scale-95 dark:hover:bg-neutral-800"
      >
        <RepeatIcon size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900">
            <h2 className="mb-1 font-semibold">Tornar recorrente</h2>
            <p className="mb-4 truncate text-sm text-neutral-500">{description}</p>
            <p className="mb-4 text-2xl font-bold">{formatCents(amountCents)}</p>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Dia de cobrança (1–31)
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={billingDay}
                  onChange={(e) => setBillingDay(parseInt(e.target.value, 10) || 1)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                A partir de
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800"
                />
              </label>

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
