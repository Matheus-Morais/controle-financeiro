import { describe, expect, it } from "vitest";
import { categoryOptions, sourceOptions } from "./form-options";

describe("sourceOptions", () => {
  it("preserva as cores escolhidas para cartões e contas", () => {
    expect(
      sourceOptions(
        [{ id: "card-1", name: "Nubank", color: "#7c3aed" }],
        [{ id: "account-1", name: "Carteira", color: "#f59e0b" }],
      ),
    ).toEqual([
      {
        value: "card:card-1",
        label: "Nubank",
        group: "Cartões",
        color: "#7c3aed",
      },
      {
        value: "account:account-1",
        label: "Carteira",
        group: "Carteira · conta",
        color: "#f59e0b",
      },
    ]);
  });

  it("usa cores padrão quando a origem não tem cor", () => {
    const options = sourceOptions(
      [{ id: "card-1", name: "Cartão", color: null }],
      [{ id: "account-1", name: "Conta" }],
    );

    expect(options.map((option) => option.color)).toEqual(["#16a34a", "#64748b"]);
  });
});

describe("categoryOptions", () => {
  it("preserva a cor das categorias e mantém a opção vazia sem cor", () => {
    expect(categoryOptions([{ id: "category-1", name: "Mercado", color: "#0ea5e9" }])).toEqual([
      { value: "", label: "Sem categoria" },
      { value: "category-1", label: "Mercado", color: "#0ea5e9" },
    ]);
  });

  it("usa o fallback para categoria sem cor", () => {
    expect(categoryOptions([{ id: "category-1", name: "Outros" }])[1]?.color).toBe("#94a3b8");
  });
});
