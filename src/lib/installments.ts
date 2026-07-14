/**
 * Geração de parcelas de uma compra.
 *
 * Valores são calculados em CENTAVOS (inteiros) para evitar erros de ponto
 * flutuante; converta para reais só na borda (UI / persistência numeric).
 */

import { addMonths, referenceMonthFor, toISO } from "./invoice";

export interface GeneratedInstallment {
  /** Número da parcela, 1..count. */
  number: number;
  /** Valor da parcela em centavos. */
  amountCents: number;
  /** Competência da parcela (`YYYY-MM-01`). */
  referenceMonth: string;
}

export interface GenerateInstallmentsParams {
  /** Valor total da compra, em centavos. */
  totalAmountCents: number;
  /** Número de parcelas (1 = à vista). */
  count: number;
  /** Data da compra `YYYY-MM-DD`. */
  purchaseDate: string;
  /** Dia de fechamento do cartão. */
  closingDay: number;
}

/**
 * Gera as parcelas em competências consecutivas a partir da fatura da compra.
 *
 * A sobra de centavos (quando o total não divide igualmente) é distribuída
 * 1 centavo por vez nas primeiras parcelas, de modo que a soma das parcelas
 * seja SEMPRE exatamente igual ao total.
 */
export function generateInstallments(params: GenerateInstallmentsParams): GeneratedInstallment[] {
  const { totalAmountCents, count, purchaseDate, closingDay } = params;

  if (!Number.isInteger(count) || count < 1) {
    throw new Error("count deve ser um inteiro >= 1");
  }
  if (!Number.isInteger(totalAmountCents) || totalAmountCents < 0) {
    throw new Error("totalAmountCents deve ser um inteiro >= 0");
  }

  const [refYear, refMonth0] = referenceMonthFor(purchaseDate, closingDay);
  const base = Math.floor(totalAmountCents / count);
  const remainder = totalAmountCents - base * count; // 0..count-1

  const result: GeneratedInstallment[] = [];
  for (let i = 0; i < count; i++) {
    const [y, m0] = addMonths(refYear, refMonth0, i);
    result.push({
      number: i + 1,
      amountCents: base + (i < remainder ? 1 : 0),
      referenceMonth: toISO(y, m0, 1),
    });
  }
  return result;
}

/** Quantas parcelas ainda faltam depois da parcela atual (inclusive futuras). */
export function remainingInstallments(count: number, currentNumber: number): number {
  return Math.max(0, count - currentNumber);
}
