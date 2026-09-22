import { describe, expect, it } from "vitest";
import { newExpenseHref } from "./navigation";

describe("newExpenseHref", () => {
  it("preserva o cartão ao adicionar gasto no detalhe do cartão", () => {
    expect(newExpenseHref("/cartoes/card-123")).toBe("/gastos/novo?cartao=card-123");
  });

  it("codifica ids especiais do cartão", () => {
    expect(newExpenseHref("/cartoes/card 123")).toBe("/gastos/novo?cartao=card%20123");
  });

  it("mantém o link padrão fora do detalhe do cartão", () => {
    expect(newExpenseHref("/gastos")).toBe("/gastos/novo");
    expect(newExpenseHref("/cartoes")).toBe("/gastos/novo");
  });
});
