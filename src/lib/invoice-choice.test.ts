import { describe, expect, it } from "vitest";
import { invoiceShift, invoiceWithShift, monthsBetween } from "./invoice-choice";

const CYCLE = { closingDay: 28, dueDay: 10 };

describe("monthsBetween", () => {
  it("conta meses dentro do ano e na virada", () => {
    expect(monthsBetween("2026-10-01", "2026-12-01")).toBe(2);
    expect(monthsBetween("2026-12-01", "2027-01-01")).toBe(1);
    expect(monthsBetween("2027-01-01", "2026-12-01")).toBe(-1);
    expect(monthsBetween("2026-10-01", "2026-10-01")).toBe(0);
  });
});

describe("invoiceWithShift", () => {
  it("shift 0 é a fatura calculada pelo ciclo", () => {
    // 20/10 ≤ fechamento 28 → competência de outubro, vence 10/11.
    const ref = invoiceWithShift("2026-10-20", CYCLE, 0);
    expect(ref.referenceMonth).toBe("2026-10-01");
    expect(ref.dueDate).toBe("2026-11-10");
  });

  it("desloca para a fatura seguinte e para a anterior", () => {
    expect(invoiceWithShift("2026-10-20", CYCLE, 1).referenceMonth).toBe("2026-11-01");
    expect(invoiceWithShift("2026-10-20", CYCLE, -1).referenceMonth).toBe("2026-09-01");
  });

  it("parte da fatura automática quando a compra passou do fechamento", () => {
    // 30/10 > 28 → automática é novembro; +1 é dezembro.
    expect(invoiceWithShift("2026-10-30", CYCLE, 0).referenceMonth).toBe("2026-11-01");
    expect(invoiceWithShift("2026-10-30", CYCLE, 1).referenceMonth).toBe("2026-12-01");
  });

  it("atravessa a virada do ano", () => {
    expect(invoiceWithShift("2026-12-20", CYCLE, 1).referenceMonth).toBe("2027-01-01");
  });
});

describe("invoiceShift", () => {
  it("devolve 0 para a fatura automática", () => {
    expect(invoiceShift("2026-10-20", 28, "2026-10-01")).toBe(0);
  });

  it("devolve o desvio em relação à automática", () => {
    expect(invoiceShift("2026-10-20", 28, "2026-11-01")).toBe(1);
    expect(invoiceShift("2026-10-30", 28, "2026-11-01")).toBe(0);
    expect(invoiceShift("2026-10-30", 28, "2026-10-01")).toBe(-1);
  });

  it("recusa mês muito distante da fatura automática", () => {
    expect(invoiceShift("2026-10-20", 28, "2027-04-01")).toBe(6);
    expect(invoiceShift("2026-10-20", 28, "2027-05-01")).toBeNull();
    expect(invoiceShift("2026-10-20", 28, "2025-01-01")).toBeNull();
  });
});
