"use client";

import { useTransition } from "react";
import { Check, Circle } from "lucide-react";
import { Spinner } from "@/components/loader";
import { toggleInvoicePaid } from "@/app/(app)/cartoes/actions";

// O botão fica sobre o header colorido do cartão (card.color, cor arbitrária).
// Por isso usa tons de branco/translúcido — legível em qualquer cor de fundo —
// em vez de uma cor fixa (verde), que destoa em cartões laranja/vermelho/etc.
export function InvoicePaidToggle({ invoiceId, paid }: { invoiceId: string; paid: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleInvoicePaid(invoiceId, !paid))}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold shadow-sm ring-1 backdrop-blur transition disabled:opacity-70 ${
        paid
          ? "bg-white/95 text-emerald-700 ring-black/5 hover:bg-white"
          : "bg-white/15 text-white ring-white/30 hover:bg-white/25"
      }`}
    >
      {pending ? <Spinner size={16} /> : paid ? <Check size={16} strokeWidth={3} /> : <Circle size={16} />}
      {pending ? "Salvando…" : paid ? "Fatura paga" : "Marcar como paga"}
    </button>
  );
}
