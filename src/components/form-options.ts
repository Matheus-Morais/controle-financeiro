import type { SelectOption } from "@/components/select";

/** Registro mínimo (cartão, conta, categoria) que os formulários listam. */
export interface Option {
  id: string;
  name: string;
}

/**
 * Origem do gasto num único campo: cartões e contas agrupados. O valor segue o
 * formato `card:<id>` / `account:<id>` que as actions já esperam — quem lê o
 * `FormData` não muda.
 */
export function sourceOptions(cards: Option[], accounts: Option[]): SelectOption[] {
  return [
    ...cards.map((c) => ({ value: `card:${c.id}`, label: c.name, group: "Cartões" })),
    ...accounts.map((a) => ({
      value: `account:${a.id}`,
      label: a.name,
      group: "Carteira · conta",
    })),
  ];
}

/** Categorias com a opção vazia na frente (categoria é sempre opcional). */
export function categoryOptions(categories: Option[]): SelectOption[] {
  return [
    { value: "", label: "Sem categoria" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];
}
