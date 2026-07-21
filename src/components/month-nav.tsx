"use client";

import Link, { useLinkStatus } from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { formatMonthLabel, shiftReferenceMonth } from "@/lib/date";

/**
 * Ícone de uma das setas de navegação. Enquanto a navegação disparada pelo
 * `<Link>` ancestral está pendente, troca a seta por um spinner — dá feedback
 * imediato de "carregando" e evita a sensação de clique inválido / cliques
 * repetidos. `useLinkStatus` (Next 15.3+) só funciona num Client Component
 * descendente do `<Link>`, por isso este subcomponente separado.
 */
function NavIcon({ direction }: { direction: "prev" | "next" }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return <Loader2 size={20} className="motion-safe:animate-spin" aria-hidden />;
  }
  return direction === "prev" ? <ChevronLeft size={20} /> : <ChevronRight size={20} />;
}

/**
 * Seletor de mês reutilizável (`‹  Julho de 2026  ›`). Navega por query param
 * `?mes=YYYY-MM-01` puramente via `<Link>` (server-side) — o mesmo padrão usado
 * na home, no detalhe do cartão e nos recebimentos. A seta clicada vira um
 * spinner enquanto o novo mês carrega.
 *
 * @param basePath rota base do link (ex.: "/", "/recebimentos", "/cartoes/ID").
 * @param refMonth competência exibida (`YYYY-MM-01`).
 */
export function MonthNav({ basePath, refMonth }: { basePath: string; refMonth: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white p-2 shadow-sm dark:bg-neutral-900">
      <Link
        href={`${basePath}?mes=${shiftReferenceMonth(refMonth, -1)}`}
        aria-label="Mês anterior"
        className="rounded-lg p-2 text-neutral-500 transition-colors active:text-brand"
      >
        <NavIcon direction="prev" />
      </Link>
      <span className="text-sm font-semibold">{formatMonthLabel(refMonth)}</span>
      <Link
        href={`${basePath}?mes=${shiftReferenceMonth(refMonth, 1)}`}
        aria-label="Próximo mês"
        className="rounded-lg p-2 text-neutral-500 transition-colors active:text-brand"
      >
        <NavIcon direction="next" />
      </Link>
    </div>
  );
}
