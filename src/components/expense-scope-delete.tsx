"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { Spinner } from "@/components/loader";
import { softDeleteInstallments, restoreInstallment } from "@/app/(app)/cartoes/[id]/actions";

interface Props {
  transactionId: string;
  /** `null` para gasto de conta (PIX/boleto), que não tem cartão. */
  cardId: string | null;
  /** Competência em foco (`YYYY-MM-01`). */
  month: string;
  /** Existe competência futura? Só então "deste mês em diante" faz sentido. */
  hasFuture: boolean;
  /** A parcela deste mês já está excluída (soft-delete)? */
  deleted: boolean;
}

/**
 * Exclusão por competência na tela de detalhe — o mesmo soft-delete da lixeira
 * da fatura (`softDeleteInstallments`), mas em botões com rótulo, já que aqui
 * sobra espaço e o usuário está decidindo o destino do gasto inteiro.
 *
 * Reversível: enquanto for soft-delete, a parcela continua no banco e volta pelo
 * "Restaurar". O caminho sem volta é o `DeleteExpenseButton`, logo abaixo dele
 * na tela.
 */
export function ExpenseScopeDelete({ transactionId, cardId, month, hasFuture, deleted }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const base =
    "flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50";

  if (deleted) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => restoreInstallment({ transactionId, month }))}
          className={`${base} bg-neutral-100 dark:bg-neutral-800`}
        >
          {pending ? <Spinner size={16} /> : <RotateCcw size={16} />}
          Restaurar este mês
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() => softDeleteInstallments({ transactionId, cardId, fromMonth: month, scope: "month" }))
        }
        className={`${base} bg-neutral-100 dark:bg-neutral-800`}
      >
        {pending ? <Spinner size={16} /> : <Trash2 size={16} />}
        Excluir só deste mês
      </button>

      {hasFuture && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              softDeleteInstallments({ transactionId, cardId, fromMonth: month, scope: "forward" }),
            )
          }
          className={`${base} bg-neutral-100 dark:bg-neutral-800`}
        >
          {pending ? <Spinner size={16} /> : <Trash2 size={16} />}
          Excluir deste mês em diante
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
