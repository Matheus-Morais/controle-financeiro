import type { SelectOption } from "@/components/select";

/** Registro mínimo (cartão, conta, categoria) que os formulários listam. */
export interface Option {
  id: string;
  name: string;
  color?: string | null;
}

const FALLBACK_CARD_COLOR = "#16a34a";
const FALLBACK_ACCOUNT_COLOR = "#64748b";
const FALLBACK_CATEGORY_COLOR = "#94a3b8";

/**
 * Origem do gasto num único campo: cartões e contas agrupados. O valor segue o
 * formato `card:<id>` / `account:<id>` que as actions já esperam.
 */
export function sourceOptions(cards: Option[], accounts: Option[]): SelectOption[] {
  return [
    ...cards.map((c) => ({
      value: `card:${c.id}`,
      label: c.name,
      group: "Cartões",
      color: c.color ?? FALLBACK_CARD_COLOR,
    })),
    ...accounts.map((a) => ({
      value: `account:${a.id}`,
      label: a.name,
      group: "Carteira · conta",
      color: a.color ?? FALLBACK_ACCOUNT_COLOR,
    })),
  ];
}

/** Categorias com a opção vazia na frente (categoria é sempre opcional). */
export function categoryOptions(categories: Option[]): SelectOption[] {
  return [
    { value: "", label: "Sem categoria" },
    ...categories.map((c) => ({
      value: c.id,
      label: c.name,
      color: c.color ?? FALLBACK_CATEGORY_COLOR,
    })),
  ];
}
