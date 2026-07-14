import { addMonths, toISO, ymd } from "./invoice";

const DEFAULT_TZ = "America/Sao_Paulo";

/** Data de hoje (`YYYY-MM-DD`) no timezone informado. */
export function todayISO(tz: string = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA já retorna YYYY-MM-DD
}

/** Competência do mês corrente (`YYYY-MM-01`). */
export function currentReferenceMonth(tz: string = DEFAULT_TZ): string {
  const [y, m0] = ymd(todayISO(tz));
  return toISO(y, m0, 1);
}

/** Soma `delta` meses a uma competência `YYYY-MM-01`. */
export function shiftReferenceMonth(referenceMonth: string, delta: number): string {
  const [y, m0] = ymd(referenceMonth);
  const [ny, nm0] = addMonths(y, m0, delta);
  return toISO(ny, nm0, 1);
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Rótulo amigável de uma competência: "2026-07-01" → "Julho de 2026". */
export function formatMonthLabel(referenceMonth: string): string {
  const [y, m0] = ymd(referenceMonth);
  return `${MONTHS[m0]} de ${y}`;
}

/** Formata `YYYY-MM-DD` como "DD/MM". */
export function formatDayMonth(iso: string): string {
  const [, m0, d] = ymd(iso);
  return `${String(d).padStart(2, "0")}/${String(m0 + 1).padStart(2, "0")}`;
}
