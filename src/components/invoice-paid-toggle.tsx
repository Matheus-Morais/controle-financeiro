"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { Spinner } from "@/components/loader";
import { shiftReferenceMonth } from "@/lib/date";
import { toggleInvoicePaid } from "@/app/(app)/cartoes/actions";

// O botão fica sobre o header colorido do cartão (card.color, cor arbitrária).
// Por isso usa tons de branco/translúcido — legível em qualquer cor de fundo —
// em vez de uma cor fixa (verde), que destoa em cartões laranja/vermelho/etc.
export function InvoicePaidToggle({
  invoiceId,
  paid,
  cardId,
  currentMonth,
}: {
  invoiceId: string;
  paid: boolean;
  cardId: string;
  currentMonth: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleInvoicePaid(invoiceId, !paid);
          // Ao marcar como paga (paid === false → paga), avança para o mês
          // seguinte — a fatura atual está resolvida. Ao desmarcar, fica no mês.
          if (!paid) {
            router.push(`/cartoes/${cardId}?mes=${shiftReferenceMonth(currentMonth, 1)}`);
          }
        })
      }
      className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm ring-1 backdrop-blur transition disabled:opacity-70 ${
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
