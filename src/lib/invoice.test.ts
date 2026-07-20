import { describe, expect, it } from "vitest";
import {
  clampDay,
  daysInMonth,
  invoiceRefForMonth,
  invoiceRefForPurchase,
  referenceMonthFor,
  referenceMonthFromDueDate,
} from "./invoice";

describe("daysInMonth", () => {
  it("fevereiro em ano comum tem 28 dias", () => {
    expect(daysInMonth(2025, 1)).toBe(28);
  });
  it("fevereiro em ano bissexto tem 29 dias", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
  });
  it("abril tem 30 dias", () => {
    expect(daysInMonth(2025, 3)).toBe(30);
  });
});

describe("clampDay", () => {
  it("limita dia 31 a fevereiro comum", () => {
    expect(clampDay(31, 2025, 1)).toBe(28);
  });
  it("mantém dia válido", () => {
    expect(clampDay(15, 2025, 0)).toBe(15);
  });
});

describe("referenceMonthFor", () => {
  const closing = 25;

  it("compra antes do fechamento cai na competência do mês da compra", () => {
    expect(referenceMonthFor("2025-07-20", closing)).toEqual([2025, 6]);
  });

  it("compra no dia do fechamento ainda cai no mês da compra", () => {
    expect(referenceMonthFor("2025-07-25", closing)).toEqual([2025, 6]);
  });

  it("compra depois do fechamento cai no mês seguinte", () => {
    expect(referenceMonthFor("2025-07-26", closing)).toEqual([2025, 7]);
  });

  it("compra em dezembro após fechamento vira para janeiro do ano seguinte", () => {
    expect(referenceMonthFor("2025-12-31", closing)).toEqual([2026, 0]);
  });

  it("fechamento dia 31 em fevereiro é limitado ao último dia (28)", () => {
    // dia 28 <= fechamento efetivo (28) → mês da compra
    expect(referenceMonthFor("2025-02-28", 31)).toEqual([2025, 1]);
  });
});

describe("invoiceRefForMonth", () => {
  it("vencimento após fechamento vence no mesmo mês", () => {
    const ref = invoiceRefForMonth(2025, 6, { closingDay: 5, dueDay: 15 });
    expect(ref).toEqual({
      referenceMonth: "2025-07-01",
      closingDate: "2025-07-05",
      dueDate: "2025-07-15",
    });
  });

  it("vencimento antes do fechamento vence no mês seguinte", () => {
    const ref = invoiceRefForMonth(2025, 6, { closingDay: 25, dueDay: 5 });
    expect(ref).toEqual({
      referenceMonth: "2025-07-01",
      closingDate: "2025-07-25",
      dueDate: "2025-08-05",
    });
  });

  it("limita dia de fechamento/vencimento em fevereiro", () => {
    const ref = invoiceRefForMonth(2025, 1, { closingDay: 31, dueDay: 30 });
    expect(ref.closingDate).toBe("2025-02-28");
    // dueDay(30) > closingDay(31)? não → vence mês seguinte (março)
    expect(ref.dueDate).toBe("2025-03-30");
  });
});

describe("invoiceRefForPurchase", () => {
  it("combina competência + vencimento (fechamento 25 / vencimento 5)", () => {
    const ref = invoiceRefForPurchase("2025-07-26", { closingDay: 25, dueDay: 5 });
    expect(ref).toEqual({
      referenceMonth: "2025-08-01",
      closingDate: "2025-08-25",
      dueDate: "2025-09-05",
    });
  });
});

describe("referenceMonthFromDueDate", () => {
  it("vencimento no mês seguinte ao fechamento (dueDay < closingDay) → recua um mês", () => {
    // Fecha 25, vence 05. Vencimento 05/08 → competência julho.
    expect(referenceMonthFromDueDate("2025-08-05", { closingDay: 25, dueDay: 5 })).toBe(
      "2025-07-01",
    );
  });
  it("vencimento no mesmo mês do fechamento (dueDay > closingDay) → mesmo mês", () => {
    // Fecha 05, vence 15. Vencimento 15/07 → competência julho.
    expect(referenceMonthFromDueDate("2025-07-15", { closingDay: 5, dueDay: 15 })).toBe(
      "2025-07-01",
    );
  });
  it("trata a virada de ano (vencimento em janeiro, competência dezembro)", () => {
    expect(referenceMonthFromDueDate("2026-01-05", { closingDay: 25, dueDay: 5 })).toBe(
      "2025-12-01",
    );
  });
  it("é o inverso de invoiceRefForMonth para o vencimento gerado", () => {
    const cycle = { closingDay: 28, dueDay: 7 };
    const ref = invoiceRefForMonth(2025, 6, cycle); // competência julho
    expect(referenceMonthFromDueDate(ref.dueDate, cycle)).toBe(ref.referenceMonth);
  });
});
