import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDB, type FakeDB } from "@/lib/fake-supabase";

/**
 * Testes das Server Actions de edição e exclusão de gasto.
 *
 * As escritas acontecem dentro de funções do Postgres (`update_expense_atomic`,
 * `delete_expense_atomic`), que não são reimplementadas aqui — o que este
 * arquivo verifica é o que cabe ao TypeScript: as guardas (sessão, posse,
 * recorrente) e o PAYLOAD montado antes da chamada, especialmente o cronograma
 * de parcelas e as capas de fatura.
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

const { deleteExpenseForever, updateExpense } = await import("./actions");

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

const TX_ID = "11111111-1111-4111-8111-111111111111";
const CARD_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";

/** Base com um gasto à vista de R$ 100 no cartão do usuário da sessão. */
function seed() {
  return createFakeDB({
    cards: [{ id: CARD_ID, user_id: "user-1", name: "Nubank", closing_day: 20, due_day: 27 }],
    categories: [{ id: CATEGORY_ID, user_id: "user-1", name: "Mercado" }],
    transactions: [{ id: TX_ID, user_id: "user-1", kind: "single", description: "Compra" }],
    installments: [
      {
        id: "inst-1",
        user_id: "user-1",
        transaction_id: TX_ID,
        number: 1,
        reference_month: "2025-03-01",
      },
    ],
  });
}

const VALID_EXPENSE = {
  description: "Compra editada",
  amount_cents: "30000",
  purchase_date: "2025-03-05",
  kind: "installment",
  installments_count: "3",
  source: `card:${CARD_ID}`,
  category_id: CATEGORY_ID,
  notes: "",
};

describe("deleteExpenseForever", () => {
  beforeEach(() => {
    db = seed();
  });

  it("chama a função atômica com o id e a opção recebidos", async () => {
    let args: Record<string, unknown> | null = null;
    db.onRpc("delete_expense_atomic", (a) => {
      args = a;
      return null;
    });

    const { result } = await run(() => deleteExpenseForever(TX_ID, true));

    expect(result?.error).toBeUndefined();
    expect(args).toEqual({ p_transaction_id: TX_ID, p_include_recurring: true });
  });

  it("recusa id que não é UUID antes de tocar no banco", async () => {
    const { result } = await run(() => deleteExpenseForever("../../etc", false));

    expect(result?.error).toBe("Dados inválidos.");
    expect(db.queries).toEqual([]);
  });

  it("recusa quando não há sessão", async () => {
    db = createFakeDB({}, null);

    const { result } = await run(() => deleteExpenseForever(TX_ID, false));

    expect(result?.error).toBe("Não autenticado.");
    expect(db.queries).toEqual([]);
  });

  it("traduz o 'não encontrado' do banco em mensagem para o usuário", async () => {
    db.onRpc("delete_expense_atomic", () => ({
      data: null,
      error: { code: "P0002", message: "not found" },
    }));

    const { result } = await run(() => deleteExpenseForever(TX_ID, false));

    expect(result?.error).toContain("Gasto não encontrado");
  });
});

describe("updateExpense", () => {
  beforeEach(() => {
    db = seed();
  });

  /** Captura os argumentos da escrita atômica e finge que nada foi descartado. */
  function captureWrite(dropped = 0) {
    const captured: { args?: Record<string, unknown> } = {};
    db.onRpc("update_expense_atomic", (a) => {
      captured.args = a;
      return dropped;
    });
    return captured;
  }

  it("regenera as parcelas e as capas de fatura pelo ciclo do cartão", async () => {
    const captured = captureWrite();

    const { redirect } = await run(() =>
      updateExpense(TX_ID, "2025-03-01", undefined, form(VALID_EXPENSE)),
    );

    const installments = captured.args?.p_installments as Record<string, unknown>[];
    const invoices = captured.args?.p_invoices as Record<string, unknown>[];

    expect(installments).toHaveLength(3);
    expect(installments.map((i) => i.amount_cents)).toEqual([10000, 10000, 10000]);
    // Compra em 05/03 num cartão que fecha dia 20: cai na fatura de março, e as
    // seguintes nos meses subsequentes.
    expect(installments.map((i) => i.reference_month)).toEqual([
      "2025-03-01",
      "2025-04-01",
      "2025-05-01",
    ]);
    // Cartão não tem vencimento por parcela — é a fatura que vence (RN-13).
    expect(installments.every((i) => i.due_date === null)).toBe(true);
    expect(invoices).toHaveLength(3);
    expect(invoices[0]).toMatchObject({ closing_date: "2025-03-20", due_date: "2025-03-27" });
    expect(redirect).toBe(`/cartoes/${CARD_ID}?mes=2025-03-01`);
  });

  it("avisa na URL quando competências pagas foram descartadas", async () => {
    captureWrite(2);

    const { redirect } = await run(() =>
      updateExpense(TX_ID, "2025-03-01", undefined, form(VALID_EXPENSE)),
    );

    expect(redirect).toContain("pagas_descartadas=2");
  });

  it("recusa editar gasto recorrente aqui", async () => {
    db.tables.transactions[0].kind = "recurring";

    const { result } = await run(() =>
      updateExpense(TX_ID, undefined, undefined, form(VALID_EXPENSE)),
    );

    expect(result?.error).toContain("tela de recorrentes");
  });

  // Quem barra o id de outro usuário é a RLS, no servidor: a leitura
  // simplesmente não encontra a linha. O fake não tem RLS, então o cenário é
  // montado pelo efeito dela — a linha não aparece — e o que se verifica é a
  // reação da action a isso: recusar, e não gravar com o vínculo alheio.
  it("recusa cartão que a RLS não deixa enxergar", async () => {
    db.tables.cards = [];

    const { result } = await run(() =>
      updateExpense(TX_ID, undefined, undefined, form(VALID_EXPENSE)),
    );

    expect(result?.error).toBe("Cartão não encontrado.");
  });

  it("recusa categoria que a RLS não deixa enxergar (RN-44)", async () => {
    db.tables.categories = [];

    const { result } = await run(() =>
      updateExpense(TX_ID, undefined, undefined, form(VALID_EXPENSE)),
    );

    expect(result?.error).toBe("Categoria não encontrada.");
  });

  it("recusa payload inválido", async () => {
    const { result } = await run(() =>
      updateExpense(TX_ID, undefined, undefined, form({ ...VALID_EXPENSE, amount_cents: "0" })),
    );

    expect(result?.error).toBeTruthy();
  });

  it("recusa quando não há sessão", async () => {
    db = createFakeDB({}, null);

    const { result } = await run(() =>
      updateExpense(TX_ID, undefined, undefined, form(VALID_EXPENSE)),
    );

    expect(result?.error).toBe("Não autenticado.");
  });
});
