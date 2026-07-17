"use client";

import { useTransition } from "react";
import { completeOnboarding } from "@/app/onboarding/actions";

/** Encerra o onboarding inteiro (a qualquer passo) e vai direto para o dashboard. */
export function SkipAllButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => completeOnboarding())}
      className="w-10 text-right text-xs font-medium text-neutral-400 disabled:opacity-50"
    >
      {pending ? "…" : "Pular"}
    </button>
  );
}
