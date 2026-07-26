"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Spinner } from "@/components/loader";

/** Botão de exclusão que chama uma server action (já vinculada ao id). */
export function DeleteButton({
  onDelete,
  confirmText = "Excluir este item?",
}: {
  onDelete: () => Promise<{ error?: string } | void>;
  confirmText?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm(confirmText)) return;
        // A ação devolve o erro em vez de falhar em silêncio: sem isto, uma
        // exclusão que não aconteceu ainda assim sumia da tela.
        startTransition(async () => {
          const res = await onDelete();
          if (res?.error) alert(res.error);
        });
      }}
      className="p-2 text-neutral-400 hover:text-red-500 disabled:opacity-50"
      aria-label="Excluir"
    >
      {pending ? <Spinner size={18} /> : <Trash2 size={18} />}
    </button>
  );
}
