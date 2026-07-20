import { describe, expect, it } from "vitest";
import { monthRange, shiftReferenceMonth } from "./date";

describe("monthRange", () => {
  it("início é o 1º dia do mês e fimExclusivo é o 1º dia do mês seguinte", () => {
    expect(monthRange("2026-07-01")).toEqual({
      start: "2026-07-01",
      endExclusive: "2026-08-01",
    });
  });

  it("trata a virada de ano (dezembro → janeiro)", () => {
    expect(monthRange("2026-12-01")).toEqual({
      start: "2026-12-01",
      endExclusive: "2027-01-01",
    });
  });

  it("fevereiro: fimExclusivo é 1º de março, independente de bissexto", () => {
    expect(monthRange("2024-02-01")).toEqual({
      start: "2024-02-01",
      endExclusive: "2024-03-01",
    });
    expect(monthRange("2025-02-01")).toEqual({
      start: "2025-02-01",
      endExclusive: "2025-03-01",
    });
  });

  it("endExclusive coincide com o start do mês seguinte (shiftReferenceMonth +1)", () => {
    const m = "2026-03-01";
    expect(monthRange(m).endExclusive).toBe(shiftReferenceMonth(m, 1));
  });
});
