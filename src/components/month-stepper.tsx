"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthLabel, shiftReferenceMonth } from "@/lib/date";

/**
 * Seletor de competência controlado por estado (`‹ Julho de 2026 ›`), irmão do
 * [`MonthNav`](./month-nav.tsx) — que navega por `<Link>` e só serve quando o mês
 * está na URL. Aqui o mês é estado do formulário (revisão da importação), então o
 * componente é controlado.
 *
 * Ocupa a largura toda de propósito: o mês por extenso não cabe num campo de meia
 * coluna, e o `input[type=month]` nativo trunca em telas estreitas.
 */
export function MonthStepper({
  value,
  onChange,
  disabled = false,
}: {
  /** Competência `YYYY-MM-01`. */
  value: string;
  onChange: (referenceMonth: string) => void;
  disabled?: boolean;
}) {
  const step = (delta: number) => () => onChange(shiftReferenceMonth(value, delta));

  return (
    <div
      className={`flex items-center justify-between gap-1 rounded-xl border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900 ${
        disabled ? "opacity-70" : ""
      }`}
    >
      <button
        type="button"
        onClick={step(-1)}
        disabled={disabled}
        aria-label="Mês anterior"
        className="rounded-lg p-2 text-neutral-500 transition active:text-brand disabled:opacity-40"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="flex-1 text-center text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {formatMonthLabel(value)}
      </span>
      <button
        type="button"
        onClick={step(1)}
        disabled={disabled}
        aria-label="Próximo mês"
        className="rounded-lg p-2 text-neutral-500 transition active:text-brand disabled:opacity-40"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
