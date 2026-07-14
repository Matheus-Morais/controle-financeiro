/**
 * Lógica de competência/fatura de cartão de crédito.
 *
 * Toda a matemática de datas aqui é PURA e determinística: opera sobre strings
 * ISO `YYYY-MM-DD` e componentes numéricos, sem depender de `Date.now()` nem do
 * timezone do ambiente. A UI passa o valor de um <input type="date">, que já
 * vem no formato `YYYY-MM-DD`.
 */

export interface CardCycle {
  /** Dia do fechamento da fatura (1–31). */
  closingDay: number;
  /** Dia do vencimento da fatura (1–31). */
  dueDay: number;
}

export interface InvoiceRef {
  /** Primeiro dia do mês de competência (`YYYY-MM-01`). Chave da fatura. */
  referenceMonth: string;
  /** Data em que a fatura fecha (`YYYY-MM-DD`). */
  closingDate: string;
  /** Data de vencimento da fatura (`YYYY-MM-DD`). */
  dueDate: string;
}

// ── Helpers de data (exportados para reuso em installments.ts) ──────────────

/** Divide `YYYY-MM-DD` em [ano, mês(0-11), dia]. */
export function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Data ISO inválida: "${iso}"`);
  return [y, m - 1, d];
}

/** Quantidade de dias no mês (mês 0-11). Trata anos bissextos. */
export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Monta uma string ISO `YYYY-MM-DD` a partir de componentes. */
export function toISO(year: number, month0: number, day: number): string {
  const mm = String(month0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Avança (ou retrocede) `delta` meses, normalizando o ano. */
export function addMonths(year: number, month0: number, delta: number): [number, number] {
  const total = year * 12 + month0 + delta;
  return [Math.floor(total / 12), ((total % 12) + 12) % 12];
}

/** Limita um dia ao último dia válido do mês (ex.: dia 31 em fevereiro → 28/29). */
export function clampDay(day: number, year: number, month0: number): number {
  return Math.min(day, daysInMonth(year, month0));
}

// ── Regras de competência ───────────────────────────────────────────────────

/**
 * Mês de competência de uma compra: a fatura cujo fechamento captura a compra.
 * Regra: se o dia da compra ≤ dia de fechamento (limitado ao último dia do mês),
 * a competência é o mês da compra; caso contrário, o mês seguinte.
 *
 * @returns [ano, mês(0-11)] do mês de competência.
 */
export function referenceMonthFor(purchaseDate: string, closingDay: number): [number, number] {
  const [y, m0, d] = ymd(purchaseDate);
  const effectiveClosing = clampDay(closingDay, y, m0);
  return d <= effectiveClosing ? [y, m0] : addMonths(y, m0, 1);
}

/**
 * Constrói a referência completa da fatura (competência, fechamento, vencimento)
 * para um dado mês de competência.
 *
 * Vencimento: se `dueDay > closingDay`, vence no mesmo mês do fechamento;
 * caso contrário, vence no mês seguinte (comportamento padrão de cartões).
 */
export function invoiceRefForMonth(refYear: number, refMonth0: number, cycle: CardCycle): InvoiceRef {
  const closingDate = toISO(refYear, refMonth0, clampDay(cycle.closingDay, refYear, refMonth0));

  const [dueYear, dueMonth0] =
    cycle.dueDay > cycle.closingDay ? [refYear, refMonth0] : addMonths(refYear, refMonth0, 1);
  const dueDate = toISO(dueYear, dueMonth0, clampDay(cycle.dueDay, dueYear, dueMonth0));

  return {
    referenceMonth: toISO(refYear, refMonth0, 1),
    closingDate,
    dueDate,
  };
}

/** Referência da fatura em que uma compra cai. */
export function invoiceRefForPurchase(purchaseDate: string, cycle: CardCycle): InvoiceRef {
  const [ry, rm0] = referenceMonthFor(purchaseDate, cycle.closingDay);
  return invoiceRefForMonth(ry, rm0, cycle);
}
