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

  // ── Retomada no meio do parcelamento (fatura importada "3/10", RN-42) ──────

  it("firstNumber começa na parcela informada e não cria as anteriores", () => {
    const parcelas = generateInstallments({
      totalAmountCents: 200000,
      count: 10,
      purchaseDate: "2026-05-10",
      closingDay: 25,
      firstNumber: 3,
      anchorMonth: "2026-07-01",
    });
    expect(parcelas).toHaveLength(8);
    expect(parcelas[0]).toEqual({ number: 3, amountCents: 20000, referenceMonth: "2026-07-01" });
    expect(parcelas[7]).toMatchObject({ number: 10, referenceMonth: "2027-02-01" });
  });

  it("a âncora manda na competência, ignorando a data da compra", () => {
    // A parcela 1 cairia em maio pelo ciclo; a fatura importada diz julho.
    const [primeira] = generateInstallments({
      totalAmountCents: 30000,
      count: 3,
      purchaseDate: "2026-05-10",
      closingDay: 25,
      anchorMonth: "2026-07-01",
    });
    expect(primeira.referenceMonth).toBe("2026-07-01");
  });

  it("uma parcela vale o mesmo criada do zero ou retomada no meio", () => {
    // O rateio da sobra é calculado sobre o cronograma completo: editar um gasto
    // que começa na parcela 3 não pode mudar o valor das parcelas 3..7.
    const base = { totalAmountCents: 10003, count: 7, purchaseDate: "2026-01-15", closingDay: 10 };
    const completo = generateInstallments(base);
    // Compra depois do fechamento → parcela 1 em fevereiro, logo a 3 é abril.
    const retomado = generateInstallments({ ...base, firstNumber: 3, anchorMonth: "2026-04-01" });

    expect(retomado.map((p) => p.amountCents)).toEqual(
      completo.filter((p) => p.number >= 3).map((p) => p.amountCents),
    );
    expect(retomado.map((p) => p.referenceMonth)).toEqual(
      completo.filter((p) => p.number >= 3).map((p) => p.referenceMonth),
    );
  });

  it("rejeita firstNumber fora do intervalo", () => {
    const base = { totalAmountCents: 1000, count: 3, purchaseDate: "2026-01-15", closingDay: 10 };
    expect(() => generateInstallments({ ...base, firstNumber: 0 })).toThrow();
    expect(() => generateInstallments({ ...base, firstNumber: 4 })).toThrow();
  });
});

describe("remainingInstallments", () => {
  it("calcula parcelas restantes", () => {
    expect(remainingInstallments(12, 3)).toBe(9);
    expect(remainingInstallments(12, 12)).toBe(0);
    expect(remainingInstallments(1, 1)).toBe(0);
  });
});
