import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthLabel, shiftReferenceMonth } from "@/lib/date";

/**
 * Seletor de mês reutilizável (`‹  Julho de 2026  ›`). Navega por query param
 * `?mes=YYYY-MM-01` puramente via `<Link>` (server-side) — o mesmo padrão usado
 * na home, no detalhe do cartão e nos recebimentos.
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
        className="rounded-lg p-2 text-neutral-500"
      >
        <ChevronLeft size={20} />
      </Link>
      <span className="text-sm font-semibold">{formatMonthLabel(refMonth)}</span>
      <Link
        href={`${basePath}?mes=${shiftReferenceMonth(refMonth, 1)}`}
        aria-label="Próximo mês"
        className="rounded-lg p-2 text-neutral-500"
      >
        <ChevronRight size={20} />
      </Link>
    </div>
  );
}
