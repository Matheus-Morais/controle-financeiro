/**
 * Escolha manual da fatura de uma compra no cartão.
 *
 * O fechamento real varia (fim de semana, feriado, tamanho do mês), mas o app
 * guarda um dia fixo por cartão. Para a compra perto da virada cair na fatura
 * certa sem falsear a data da compra, o usuário pode deslocar a fatura em
 * relação à calculada pelo ciclo. Tudo PURO, como o resto da lógica de fatura.
 */

import {
  addMonths,
  invoiceRefForMonth,
  referenceMonthFor,
  ymd,
  type CardCycle,
  type InvoiceRef,
} from "./invoice";

/** Maior deslocamento aceito. Folga larga: o uso real é ±1; o resto é erro de digitação. */
export const MAX_INVOICE_SHIFT = 6;

/** Quantos meses separam duas competências (`to` − `from`). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm0] = ymd(from);
  const [ty, tm0] = ymd(to);
  return (ty - fy) * 12 + (tm0 - fm0);
}

/** Fatura da compra pelo ciclo do cartão, deslocada `shift` meses (0 = automática). */
export function invoiceWithShift(purchaseDate: string, cycle: CardCycle, shift: number): InvoiceRef {
  const [y, m0] = referenceMonthFor(purchaseDate, cycle.closingDay);
  const [ry, rm0] = addMonths(y, m0, shift);
  return invoiceRefForMonth(ry, rm0, cycle);
}

/**
 * Deslocamento de uma competência escolhida em relação à automática, ou `null`
 * quando passa de {@link MAX_INVOICE_SHIFT}.
 */
export function invoiceShift(
  purchaseDate: string,
  closingDay: number,
  chosenMonth: string,
): number | null {
  const [y, m0] = referenceMonthFor(purchaseDate, closingDay);
  const shift = monthsBetween(`${y}-${String(m0 + 1).padStart(2, "0")}-01`, chosenMonth);
  return Math.abs(shift) <= MAX_INVOICE_SHIFT ? shift : null;
}
