import { describe, expect, it } from "vitest";
import { brazilianHolidays, easterSunday, nthBusinessDay } from "./business-days";

describe("easterSunday", () => {
  it("calcula o domingo de Páscoa (anos conhecidos)", () => {
    expect(easterSunday(2024)).toEqual([2024, 2, 31]); // 31/mar/2024
    expect(easterSunday(2025)).toEqual([2025, 3, 20]); // 20/abr/2025
    expect(easterSunday(2026)).toEqual([2026, 3, 5]); // 05/abr/2026
    expect(easterSunday(2027)).toEqual([2027, 2, 28]); // 28/mar/2027
  });
});

describe("brazilianHolidays", () => {
  it("inclui feriados fixos", () => {
    const h = brazilianHolidays(2025);
    expect(h.has("2025-01-01")).toBe(true); // Confraternização
    expect(h.has("2025-09-07")).toBe(true); // Independência
    expect(h.has("2025-12-25")).toBe(true); // Natal
  });

  it("inclui feriados móveis derivados da Páscoa", () => {
    const h = brazilianHolidays(2025); // Páscoa 20/abr/2025
    expect(h.has("2025-03-04")).toBe(true); // Carnaval (Páscoa−47)
    expect(h.has("2025-04-18")).toBe(true); // Sexta-Feira Santa (Páscoa−2)
    expect(h.has("2025-06-19")).toBe(true); // Corpus Christi (Páscoa+60)
  });
});

describe("nthBusinessDay", () => {
  it("mês sem feriado no começo: 5º dia útil de julho/2025 é dia 7", () => {
    // jul/2025: ter 1, qua 2, qui 3, sex 4, [sáb 5, dom 6], seg 7
    expect(nthBusinessDay(2025, 6, 5)).toBe(7);
    expect(nthBusinessDay(2025, 6, 1)).toBe(1);
  });

  it("pula feriado no começo: 5º dia útil de janeiro/2026 é dia 8", () => {
    // jan/2026: qui 1 (feriado), sex 2 (1º), [sáb 3, dom 4], seg 5 (2º),
    // ter 6 (3º), qua 7 (4º), qui 8 (5º)
    expect(nthBusinessDay(2026, 0, 5)).toBe(8);
  });

  it("N além do total retorna o último dia útil do mês", () => {
    // jul/2025 termina em qui 31 (dia útil)
    expect(nthBusinessDay(2025, 6, 99)).toBe(31);
  });

  it("respeita fevereiro bissexto (2028) sem estourar o mês", () => {
    const day = nthBusinessDay(2028, 1, 99);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(29);
  });

  it("trata n < 1 como o 1º dia útil", () => {
    expect(nthBusinessDay(2025, 6, 0)).toBe(1);
  });
});
