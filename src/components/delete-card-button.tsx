"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/loader";

/**
 * Exclusão do cartão na tela de edição. É um client component (e não um
 * `<form action={...}>`) porque a ação agora devolve `{ error }` em vez de
 * `void`: sem isso, uma exclusão recusada pelo servidor não deixaria rastro
 * na UI.
 */
export function DeleteCardButton({ onDelete }: { onDelete: () => Promise<{ error?: string }> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Excluir este cartão? Os gastos vinculados também serão removidos.")) return;
          setError(undefined);
          startTransition(async () => {
            const res = await onDelete();
            if (res?.error) setError(res.error);
          });
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900"
      >
        {pending && <Spinner size={16} />}
        Excluir cartão
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
