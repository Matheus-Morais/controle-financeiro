"use client";

import { useTransition } from "react";
import { CircleStop } from "lucide-react";
import { Spinner } from "@/components/loader";

/**
 * Encerra a repetição de uma renda recorrente a partir deste mês.
 *
 * Antes só dava para apagar o recebimento do mês — e, como a materialização
 * copia do mês anterior, a renda voltava no mês seguinte. Aqui o registro do mês
 * fica; o que para é a propagação.
 */
export function EndRecurrenceButton({ onEnd }: { onEnd: () => Promise<{ error?: string }> }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Encerrar a recorrência? Este mês continua, os próximos não serão criados."))
          return;
        startTransition(async () => {
          const res = await onEnd();
          if (res?.error) alert(res.error);
        });
      }}
      className="p-2 text-neutral-400 hover:text-amber-600 disabled:opacity-50"
      aria-label="Encerrar recorrência"
      title="Encerrar recorrência"
    >
      {pending ? <Spinner size={18} /> : <CircleStop size={18} />}
    </button>
  );
}
