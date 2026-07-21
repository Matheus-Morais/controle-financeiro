import { describe, expect, it } from "vitest";
import { nextOpenMonth } from "./card-invoices";

describe("nextOpenMonth", () => {
  it("fica no mês corrente quando não há faturas pagas", () => {
    expect(nextOpenMonth("2026-07-01", new Set())).toBe("2026-07-01");
  });

  it("avança um mês quando a fatura corrente está paga", () => {
    expect(nextOpenMonth("2026-07-01", new Set(["2026-07-01"]))).toBe("2026-08-01");
  });

  it("pula meses consecutivos pagos e vira o ano", () => {
    const paid = new Set(["2026-11-01", "2026-12-01"]);
    expect(nextOpenMonth("2026-11-01", paid)).toBe("2027-01-01");
  });

  it("para no primeiro buraco (mês sem fatura no meio não conta como pago)", () => {
    // Agosto pago, setembro sem fatura, outubro pago → para em setembro.
    const paid = new Set(["2026-08-01", "2026-10-01"]);
    expect(nextOpenMonth("2026-08-01", paid)).toBe("2026-09-01");
  });

  it("respeita a trava maxAhead", () => {
    const paid = new Set(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(nextOpenMonth("2026-07-01", paid, 2)).toBe("2026-09-01");
  });
});
