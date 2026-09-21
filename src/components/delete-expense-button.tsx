"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { Spinner } from "@/components/loader";
import { deleteExpenseForever } from "@/app/(app)/gastos/[id]/actions";

interface Props {
  transactionId: string;
  /** Quantas parcelas somem (todas as competências, inclusive pagas). */
  installmentsCount: number;
  /** Ocorrência de assinatura? Habilita apagar o template inteiro. */
  isRecurring: boolean;
  /** Para onde voltar depois de apagar (o gasto deixa de existir). */
  redirectTo: string;
}

/**
 * Exclusão DEFINITIVA, com confirmação em dois passos.
 *
 * É a única ação do app que destrói histórico, então nada aqui acontece a um
 * toque: o primeiro abre o diálogo, que ENUMERA o que vai sumir antes de
 * oferecer o botão destrutivo. O escopo por competência (apagar só este mês, ou
 * deste mês em diante) continua no soft-delete da fatura — ali dá para desfazer.
 *
 * Para uma ocorrência de ASSINATURA, o único "para sempre" possível é apagar o
 * template inteiro. Apagar de vez só o mês não resolveria nada: a idempotência
 * da materialização enxerga a parcela soft-deleted (migration 0017) mas não uma
 * linha que deixou de existir, então a ocorrência voltaria no próximo render do
 * mês. Para tirar um mês só de uma assinatura, o caminho é o soft-delete.
 */
export function DeleteExpenseButton({
  transactionId,
  installmentsCount,
  isRecurring,
  redirectTo,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(includeRecurring: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await deleteExpenseForever(transactionId, includeRecurring);
      if (res?.error) {
        setError(res.error);
        return;
      }
      // `replace`: o gasto não existe mais, voltar para cá seria um 404.
      router.replace(redirectTo);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 transition active:scale-[0.98] dark:border-red-900"
      >
        <Trash2 size={16} />
        Excluir para sempre
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
            <h2 className="flex items-center gap-2 text-base font-semibold text-red-600">
              <TriangleAlert size={18} />
              Excluir para sempre
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              Não dá para desfazer. Some do histórico, das faturas e dos relatórios:
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-neutral-500">
              {isRecurring ? (
                <>
                  <li>a assinatura</li>
                  <li>todos os meses já lançados por ela, inclusive os pagos</li>
                </>
              ) : (
                <>
                  <li>
                    {installmentsCount === 1 ? "1 parcela" : `${installmentsCount} parcelas`} —
                    todas as competências, inclusive as já pagas
                  </li>
                  <li>o lançamento em si</li>
                </>
              )}
            </ul>

            {isRecurring && (
              <p className="mt-3 rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-800">
                Para tirar só um mês, use a lixeira do gasto na fatura do cartão — apagar de vez
                uma única cobrança não adianta, ela é lançada de novo no mês seguinte.
              </p>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(isRecurring)}
                className="flex items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-50"
              >
                {pending && <Spinner size={16} />}
                {isRecurring ? "Excluir a assinatura e todos os meses" : "Excluir este gasto"}
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
