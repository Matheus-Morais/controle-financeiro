/**
 * Ordenação dos itens da fatura de um cartão (PURO, testado).
 *
 * A função `invoice_items` não tem `ORDER BY`, então a ordem que chega do banco é
 * a física do Postgres — instável entre leituras. A tela ordena aqui.
 */
export interface SortableInvoiceItem {
  description: string;
  /** Data da compra, ISO `YYYY-MM-DD`. */
  purchaseDate: string;
  number: number;
  /** Parcela excluída (soft-delete): vai para o fim da lista. */
  deleted: boolean;
}

/**
 * Ativos primeiro, excluídos no fim; dentro de cada grupo, compra mais recente
 * primeiro. Empate de data cai na descrição e depois no nº da parcela, para a
 * ordem não oscilar entre renderizações. Datas ISO comparam como texto.
 */
export function sortInvoiceItems<T extends SortableInvoiceItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(a.deleted) - Number(b.deleted) ||
      b.purchaseDate.localeCompare(a.purchaseDate) ||
      a.description.localeCompare(b.description, "pt-BR") ||
      a.number - b.number,
  );
}
