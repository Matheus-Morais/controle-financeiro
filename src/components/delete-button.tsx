"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Spinner } from "@/components/loader";

/** Botão de exclusão que chama uma server action (já vinculada ao id). */
export function DeleteButton({
  onDelete,
  confirmText = "Excluir este item?",
}: {
  onDelete: () => Promise<void>;
  confirmText?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm(confirmText)) startTransition(() => onDelete());
      }}
      className="p-2 text-neutral-400 hover:text-red-500 disabled:opacity-50"
      aria-label="Excluir"
    >
      {pending ? <Spinner size={18} /> : <Trash2 size={18} />}
    </button>
  );
}
