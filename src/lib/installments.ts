/**
 * Geração de parcelas de uma compra.
 *
 * Valores são calculados em CENTAVOS (inteiros) para evitar erros de ponto
 * flutuante; converta para reais só na borda (UI / persistência numeric).
 */

import { addMonths, referenceMonthFor, toISO, ymd } from "./invoice";

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
  /**
   * Primeira parcela a materializar (1..count). Default 1.
   *
   * Maior que 1 quando o gasto entra no MEIO do parcelamento — a fatura
   * importada que mostra "3/10" (RN-42). As parcelas anteriores pertencem a
   * faturas passadas e não são criadas, mas continuam contando para o rateio
   * dos centavos (o cronograma é sempre o da compra inteira).
   */
  firstNumber?: number;
  /**
   * Competência (`YYYY-MM-01`) da parcela `firstNumber`. Default: a fatura em
   * que a compra cai (`purchaseDate` + `closingDay`).
   *
   * Quando informada, ela manda: é o caso da importação (competência forçada
   * para o lote) e o da edição de um gasto que já tem parcelas gravadas — sem
   * âncora, regenerar deslocaria as competências já lançadas (RN-09).
   */
  anchorMonth?: string;
}

/**
 * Gera as parcelas em competências consecutivas a partir da fatura da compra.
 *
 * A sobra de centavos (quando o total não divide igualmente) é distribuída
 * 1 centavo por vez nas primeiras parcelas, de modo que a soma das parcelas
 * seja SEMPRE exatamente igual ao total (RN-04). O rateio é calculado sobre o
 * cronograma completo (1..count), então uma parcela tem o mesmo valor esteja
 * ela sendo criada do zero ou retomada no meio via `firstNumber`.
 */
export function generateInstallments(params: GenerateInstallmentsParams): GeneratedInstallment[] {
  const { totalAmountCents, count, purchaseDate, closingDay, firstNumber = 1, anchorMonth } = params;

  if (!Number.isInteger(count) || count < 1) {
    throw new Error("count deve ser um inteiro >= 1");
  }
  if (!Number.isInteger(totalAmountCents) || totalAmountCents < 0) {
    throw new Error("totalAmountCents deve ser um inteiro >= 0");
  }
  if (!Number.isInteger(firstNumber) || firstNumber < 1 || firstNumber > count) {
    throw new Error("firstNumber deve ser um inteiro entre 1 e count");
  }

  const [anchorYear, anchorMonth0] = anchorMonth
    ? ymd(anchorMonth)
    : referenceMonthFor(purchaseDate, closingDay);
  const base = Math.floor(totalAmountCents / count);
  const remainder = totalAmountCents - base * count; // 0..count-1

  const result: GeneratedInstallment[] = [];
  for (let n = firstNumber; n <= count; n++) {
    const [y, m0] = addMonths(anchorYear, anchorMonth0, n - firstNumber);
    result.push({
      number: n,
      // `n - 1` é o índice 0-based da parcela no cronograma completo: as
      // primeiras `remainder` parcelas levam o centavo extra.
      amountCents: base + (n - 1 < remainder ? 1 : 0),
      referenceMonth: toISO(y, m0, 1),
    });
  }
  return result;
}

/** Quantas parcelas ainda faltam depois da parcela atual (inclusive futuras). */
export function remainingInstallments(count: number, currentNumber: number): number {
  return Math.max(0, count - currentNumber);
}
