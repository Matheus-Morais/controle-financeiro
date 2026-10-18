import { describe, expect, it } from "vitest";
import { sortInvoiceItems, type SortableInvoiceItem } from "./invoice-items";

const item = (
  description: string,
  purchaseDate: string,
  extra: Partial<SortableInvoiceItem> = {},
): SortableInvoiceItem => ({ description, purchaseDate, number: 1, deleted: false, ...extra });

const names = (items: SortableInvoiceItem[]) => items.map((i) => i.description);

describe("sortInvoiceItems", () => {
  it("ordena pela data da compra, da mais recente para a mais antiga", () => {
    const sorted = sortInvoiceItems([
      item("B", "2026-09-05"),
      item("C", "2026-09-20"),
      item("A", "2026-08-29"),
    ]);
    expect(names(sorted)).toEqual(["C", "B", "A"]);
  });

  it("compara datas em anos e meses diferentes", () => {
    const sorted = sortInvoiceItems([
      item("antiga", "2025-12-31"),
      item("nova", "2026-01-01"),
    ]);
    expect(names(sorted)).toEqual(["nova", "antiga"]);
  });

  it("mantém os excluídos no fim, também ordenados por data", () => {
    const sorted = sortInvoiceItems([
      item("excluído recente", "2026-09-30", { deleted: true }),
      item("ativo antigo", "2026-08-01"),
      item("excluído antigo", "2026-08-02", { deleted: true }),
      item("ativo recente", "2026-09-10"),
    ]);
    expect(names(sorted)).toEqual([
      "ativo recente",
      "ativo antigo",
      "excluído recente",
      "excluído antigo",
    ]);
  });

  it("desempata pela descrição e depois pelo nº da parcela", () => {
    const sorted = sortInvoiceItems([
      item("Zeta", "2026-09-05"),
      item("Alfa", "2026-09-05", { number: 3 }),
      item("Alfa", "2026-09-05", { number: 2 }),
    ]);
    expect(sorted.map((i) => `${i.description}${i.number}`)).toEqual(["Alfa2", "Alfa3", "Zeta1"]);
  });

  it("não altera a lista recebida", () => {
    const input = [item("B", "2026-09-05"), item("A", "2026-09-20")];
    sortInvoiceItems(input);
    expect(names(input)).toEqual(["B", "A"]);
  });
});
