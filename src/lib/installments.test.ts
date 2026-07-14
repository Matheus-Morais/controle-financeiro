import { describe, expect, it } from "vitest";
import { generateInstallments, remainingInstallments } from "./installments";

describe("generateInstallments", () => {
  it("à vista gera 1 parcela na competência da compra", () => {
    const parcelas = generateInstallments({
      totalAmountCents: 15000,
      count: 1,
      purchaseDate: "2025-07-10",
      closingDay: 25,
    });
    expect(parcelas).toEqual([
      { number: 1, amountCents: 15000, referenceMonth: "2025-07-01" },
    ]);
  });

  it("parcelado divide igualmente quando não há sobra", () => {
    const parcelas = generateInstallments({
      totalAmountCents: 30000,
      count: 3,
      purchaseDate: "2025-07-10",
      closingDay: 25,
    });
    expect(parcelas.map((p) => p.amountCents)).toEqual([10000, 10000, 10000]);
    expect(parcelas.map((p) => p.referenceMonth)).toEqual([
      "2025-07-01",
      "2025-08-01",
      "2025-09-01",
    ]);
  });

  it("distribui a sobra de centavos nas primeiras parcelas e a soma bate o total", () => {
    const total = 10000; // R$ 100,00 em 3x
    const parcelas = generateInstallments({
      totalAmountCents: total,
      count: 3,
      purchaseDate: "2025-07-10",
      closingDay: 25,
    });
    expect(parcelas.map((p) => p.amountCents)).toEqual([3334, 3333, 3333]);
    expect(parcelas.reduce((s, p) => s + p.amountCents, 0)).toBe(total);
  });

  it("compra após o fechamento empurra a 1ª competência para o mês seguinte", () => {
    const parcelas = generateInstallments({
      totalAmountCents: 24000,
      count: 12,
      purchaseDate: "2025-07-26",
      closingDay: 25,
    });
    expect(parcelas[0].referenceMonth).toBe("2025-08-01");
    expect(parcelas[11].referenceMonth).toBe("2026-07-01");
    expect(parcelas).toHaveLength(12);
  });

  it("soma sempre igual ao total para valores arbitrários", () => {
    for (const total of [9999, 10001, 12345, 100003]) {
      for (const count of [2, 3, 6, 7, 12]) {
        const parcelas = generateInstallments({
          totalAmountCents: total,
          count,
          purchaseDate: "2025-01-15",
          closingDay: 10,
        });
        expect(parcelas.reduce((s, p) => s + p.amountCents, 0)).toBe(total);
        expect(parcelas).toHaveLength(count);
      }
    }
  });

  it("rejeita count inválido", () => {
    expect(() =>
      generateInstallments({ totalAmountCents: 100, count: 0, purchaseDate: "2025-01-01", closingDay: 10 }),
    ).toThrow();
  });
});

describe("remainingInstallments", () => {
  it("calcula parcelas restantes", () => {
    expect(remainingInstallments(12, 3)).toBe(9);
    expect(remainingInstallments(12, 12)).toBe(0);
    expect(remainingInstallments(1, 1)).toBe(0);
  });
});
