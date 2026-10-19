import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDB, type FakeDB } from "@/lib/fake-supabase";

/**
 * Escolha manual da fatura ao lançar um gasto (RN-57): a data da compra fica
 * como foi digitada e só a competência das parcelas se desloca.
 */

let db: FakeDB;

vi.mock("@/lib/supabase/server", () => ({ createClient: () => Promise.resolve(db) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class RedirectError extends Error {
  constructor(public to: string) {
    super(`redirect:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const { createExpense } = await import("./actions");

async function run<T>(fn: () => Promise<T>): Promise<{ redirect?: string; result?: T }> {
  try {
    return { result: await fn() };
  } catch (e) {
    if (e instanceof RedirectError) return { redirect: e.to };
    throw e;
  }
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const CARD_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

const VALID_EXPENSE = {
  description: "Mercado",
  amount_cents: "30000",
  purchase_date: "2025-03-25",
  kind: "installment",
  installments_count: "3",
  source: `card:${CARD_ID}`,
  category_id: "",
  notes: "",
};

describe("createExpense — fatura escolhida", () => {
  let captured: { args?: Record<string, unknown> };

  beforeEach(() => {
    db = createFakeDB({
      cards: [{ id: CARD_ID, user_id: "user-1", name: "Nubank", closing_day: 20, due_day: 27 }],
      accounts: [{ id: ACCOUNT_ID, user_id: "user-1", name: "PIX" }],
    });
    captured = {};
    db.onRpc("create_expense_atomic", (a) => {
      captured.args = a;
      return null;
    });
  });

  const months = () =>
    (captured.args?.p_installments as Record<string, unknown>[]).map((i) => i.reference_month);

  it("sem escolha, a fatura vem do fechamento do cartão", async () => {
    // 25/03 > fechamento 20 → fatura de abril.
    const { redirect } = await run(() => createExpense(undefined, form(VALID_EXPENSE)));

    expect(months()).toEqual(["2025-04-01", "2025-05-01", "2025-06-01"]);
    expect(redirect).toBe(`/cartoes/${CARD_ID}?mes=2025-04-01`);
  });

  it("campo vazio equivale a não escolher", async () => {
    await run(() => createExpense(undefined, form({ ...VALID_EXPENSE, invoice_month: "" })));

    expect(months()[0]).toBe("2025-04-01");
  });

  it("escolhida: parcelas partem dela e a data da compra não muda", async () => {
    // O banco fechou depois de 25/03: a compra ainda entrou na fatura de março.
    const { redirect } = await run(() =>
      createExpense(undefined, form({ ...VALID_EXPENSE, invoice_month: "2025-03-01" })),
    );

    expect(months()).toEqual(["2025-03-01", "2025-04-01", "2025-05-01"]);
    expect((captured.args?.p_transaction as Record<string, unknown>).purchase_date).toBe(
      "2025-03-25",
    );
    expect(redirect).toBe(`/cartoes/${CARD_ID}?mes=2025-03-01`);
  });

  it("grava a capa de cada fatura escolhida com o ciclo do cartão", async () => {
    await run(() =>
      createExpense(undefined, form({ ...VALID_EXPENSE, invoice_month: "2025-03-01" })),
    );

    const invoices = captured.args?.p_invoices as Record<string, unknown>[];
    expect(invoices[0]).toMatchObject({
      reference_month: "2025-03-01",
      closing_date: "2025-03-20",
      due_date: "2025-03-27",
    });
  });

  it("recusa fatura muito distante da compra, sem gravar", async () => {
    const { result } = await run(() =>
      createExpense(undefined, form({ ...VALID_EXPENSE, invoice_month: "2026-03-01" })),
    );

    expect(result?.error).toBe("Fatura muito distante da data da compra.");
    expect(captured.args).toBeUndefined();
  });

  it("ignora a escolha quando a origem é uma conta", async () => {
    await run(() =>
      createExpense(
        undefined,
        form({
          ...VALID_EXPENSE,
          source: `account:${ACCOUNT_ID}`,
          kind: "single",
          installments_count: "1",
          invoice_month: "2025-06-01",
        }),
      ),
    );

    // Conta não tem fatura: a competência segue o mês da compra.
    expect(months()).toEqual(["2025-03-01"]);
  });
});
