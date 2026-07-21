"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { Spinner } from "@/components/loader";
import { toggleBillPaid } from "@/app/(app)/contas/actions";

/** Alterna o status de uma conta (em aberto ↔ paga). */
export function BillPaidToggle({ installmentId, paid }: { installmentId: string; paid: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleBillPaid(installmentId, !paid);
          router.refresh();
        })
      }
      aria-label={paid ? "Marcar como em aberto" : "Marcar como paga"}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-60 ${
        paid
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
          : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
      }`}
    >
      {pending ? (
        <Spinner size={16} />
      ) : paid ? (
        <Check size={16} strokeWidth={3} />
      ) : (
        <Circle size={16} />
      )}
    </button>
  );
}
