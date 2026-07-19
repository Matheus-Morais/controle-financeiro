"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { softDeleteInstallments, restoreInstallment } from "@/app/(app)/cartoes/[id]/actions";

interface Props {
  transactionId: string;
  cardId: string;
  currentMonth: string; // YYYY-MM-01
  /** Excluir "deste mês em diante" faz sentido? (parcela com futuras ou recorrente) */
  hasFuture: boolean;
  deleted: boolean;
}

export function DeleteInstallmentButton({
  transactionId,
  cardId,
  currentMonth,
  hasFuture,
  deleted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ error?: string } | void>) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (deleted) {
    return (
      <button
        type="button"
        aria-label="Restaurar gasto"
        disabled={pending}
        onClick={() => run(() => restoreInstallment({ transactionId, month: currentMonth }))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-neutral-400 active:scale-95 disabled:opacity-50 dark:text-neutral-500"
      >
        <RotateCcw size={18} />
      </button>
    );
  }

  function del(scope: "month" | "forward") {
    run(() => softDeleteInstallments({ transactionId, cardId, fromMonth: currentMonth, scope }));
  }

  return (
    <>
      <button
        type="button"
        aria-label="Excluir gasto"
        disabled={pending}
        onClick={() => (hasFuture ? setOpen(true) : del("month"))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-red-500 active:scale-95 disabled:opacity-50"
      >
        <Trash2 size={18} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">Excluir gasto</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Os meses anteriores são mantidos no histórico.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => del("month")}
                className="rounded-xl bg-neutral-100 py-3 text-sm font-medium active:scale-[0.99] disabled:opacity-50 dark:bg-neutral-800"
              >
                Apagar só deste mês
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => del("forward")}
                className="rounded-xl bg-red-600 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-50"
              >
                Apagar deste mês e os seguintes
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="rounded-xl py-3 text-sm font-medium text-neutral-500 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
