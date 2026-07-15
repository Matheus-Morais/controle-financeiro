"use client";

import { useTransition } from "react";
import { Spinner } from "@/components/loader";
import { toggleRecurringActive } from "@/app/(app)/recorrentes/actions";

export function RecurringToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleRecurringActive(id, !active))}
      className={
        active
          ? "inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-1 text-xs font-medium text-brand disabled:opacity-50"
          : "inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-500 disabled:opacity-50 dark:bg-neutral-800"
      }
    >
      {pending && <Spinner size={12} />}
      {active ? "Ativa" : "Pausada"}
    </button>
  );
}
