"use client";

import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { Spinner } from "@/components/loader";

/**
 * Botão de excluir gasto. Mostra o Spinner e desabilita enquanto a Server
 * Action está pendente (`useFormStatus`), evitando a sensação de "tela travada"
 * durante a exclusão. O estado pendente permanece até a navegação de volta ao
 * cartão concluir.
 */
function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 transition active:scale-[0.98] disabled:opacity-60 dark:border-red-900"
    >
      {pending ? <Spinner size={16} /> : <Trash2 size={16} />}
      {pending ? "Excluindo…" : "Excluir gasto"}
    </button>
  );
}

export function DeleteExpenseButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <DeleteButton />
    </form>
  );
}
