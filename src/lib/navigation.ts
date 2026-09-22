/** Link do cadastro de gasto contextualizado pela rota atual. */
export function newExpenseHref(pathname: string): string {
  const cardId = pathname.match(/^\/cartoes\/([^/]+)$/)?.[1];
  return cardId ? `/gastos/novo?cartao=${encodeURIComponent(cardId)}` : "/gastos/novo";
}
