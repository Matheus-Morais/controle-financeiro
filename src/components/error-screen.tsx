"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

/**
 * Corpo das telas de erro (`error.tsx`). Fica em um componente só porque a
 * mesma tela serve a raiz e a área logada — o que muda entre elas é apenas o
 * layout em volta, que o Next escolhe pelo lugar do arquivo.
 */
export function ErrorScreen({
  error,
  reset,
  scope,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  scope: string;
}) {
  useEffect(() => {
    // O digest é o que liga esta tela ao stack trace nos logs da Vercel. Não
    // logamos `error.message` — a mensagem pode carregar dado do usuário.
    console.error(`[erro:${scope}]`, error.digest ?? error.name);
  }, [error, scope]);

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <TriangleAlert size={32} className="text-neutral-300" />
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p className="max-w-xs text-sm text-neutral-500">
        Não conseguimos carregar esta tela. Quase sempre é coisa passageira —
        tente de novo.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          <RotateCw size={16} />
          Tentar de novo
        </button>
        <Link
          href="/"
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
        >
          Início
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-4 text-xs text-neutral-400">Código: {error.digest}</p>
      ) : null}
    </div>
  );
}
