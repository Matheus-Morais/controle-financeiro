"use client";

import { useTransition } from "react";
import { Check, Circle } from "lucide-react";
import { toggleInvoicePaid } from "@/app/(app)/cartoes/actions";

export function InvoicePaidToggle({ invoiceId, paid }: { invoiceId: string; paid: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleInvoicePaid(invoiceId, !paid))}
      className={
        paid
          ? "flex items-center gap-2 rounded-xl bg-brand/15 px-3 py-2 text-sm font-medium text-brand"
          : "flex items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-700"
      }
    >
      {paid ? <Check size={16} /> : <Circle size={16} />}
      {pending ? "…" : paid ? "Fatura paga" : "Marcar como paga"}
    </button>
  );
}
