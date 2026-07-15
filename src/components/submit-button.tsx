"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./loader";

/**
 * Botão de envio padrão dos formulários. Mostra o Spinner enquanto a
 * Server Action está pendente (`useFormStatus`).
 */
export function SubmitButton({
  children,
  pendingLabel = "Aguarde…",
  className = "",
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-60 ${className}`.trim()}
    >
      {pending && <Spinner size={18} />}
      {pending ? pendingLabel : children}
    </button>
  );
}
