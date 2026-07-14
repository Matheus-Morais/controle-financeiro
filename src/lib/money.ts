/** Utilitários de dinheiro. Internamente trabalhamos com centavos (inteiros). */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos como moeda BRL: 123456 → "R$ 1.234,56". */
export function formatCents(cents: number): string {
  return BRL.format(cents / 100);
}

/** Converte reais (número) para centavos inteiros, arredondando. */
export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

/** Converte centavos para reais (número). */
export function toReais(cents: number): number {
  return cents / 100;
}

/**
 * Faz o parse de um valor digitado em pt-BR ("1.234,56" ou "1234,56" ou "1234.56")
 * para centavos. Retorna null se não for um número válido.
 */
export function parseBRLToCents(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // remove separador de milhar
    .replace(",", ".");
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return null;
  return Math.round(Number(cleaned) * 100);
}
