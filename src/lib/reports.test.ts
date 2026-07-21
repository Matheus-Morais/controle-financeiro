import { describe, expect, it } from "vitest";
import { aggregateInstallmentTotals } from "./reports";

describe("aggregateInstallmentTotals", () => {
  it("soma parcelas por chave (card_id, reference_month)", () => {
    const totals = aggregateInstallmentTotals([
      { card_id: "a", reference_month: "2026-06-01", amount_cents: 1000 },
      { card_id: "a", reference_month: "2026-06-01", amount_cents: 2500 },
      { card_id: "a", reference_month: "2026-07-01", amount_cents: 700 },
      { card_id: "b", reference_month: "2026-06-01", amount_cents: 500 },
    ]);
    expect(totals.get("a|2026-06-01")).toBe(3500);
    expect(totals.get("a|2026-07-01")).toBe(700);
    expect(totals.get("b|2026-06-01")).toBe(500);
    expect(totals.size).toBe(3);
  });

  it("ignora parcelas sem cartão (card_id nulo — gastos à vista)", () => {
    const totals = aggregateInstallmentTotals([
      { card_id: null, reference_month: "2026-06-01", amount_cents: 9999 },
      { card_id: "a", reference_month: "2026-06-01", amount_cents: 100 },
    ]);
    expect(totals.size).toBe(1);
    expect(totals.get("a|2026-06-01")).toBe(100);
  });

  it("lista vazia gera mapa vazio", () => {
    expect(aggregateInstallmentTotals([]).size).toBe(0);
  });

  it("chaves não consultadas convivem sem interferir (produto cartesiano)", () => {
    // A query .in(card_id).in(reference_month) pode trazer combinações que não
    // existem como fatura; o consumidor só lê as chaves que quer, então o
    // excesso apenas ocupa o mapa.
    const totals = aggregateInstallmentTotals([
      { card_id: "a", reference_month: "2026-06-01", amount_cents: 100 },
      { card_id: "b", reference_month: "2026-05-01", amount_cents: 200 },
    ]);
    expect(totals.get("a|2026-06-01")).toBe(100);
    expect(totals.get("a|2026-05-01")).toBeUndefined();
  });
});
