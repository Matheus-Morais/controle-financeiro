import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDB, type FakeDB } from "@/lib/fake-supabase";

/**
 * Testes das Server Actions de cartão.
 *
 * A suíte cobria bem os módulos puros, mas nada do caminho que efetivamente
 * grava: validação do payload, recusa de sessão ausente, escopo por `user_id` e
 * os efeitos colaterais. É justamente onde um descuido vira dado errado no
 * banco — ou, no caso do escopo, dado de outro usuário.
 *
 * O client Supabase é o fake do projeto; `next/cache` e `next/navigation` são
 * dublês porque só existem dentro do runtime do Next. `redirect()` interrompe a
 * execução lançando, e o dublê reproduz isso: sem lançar, o código depois do
 * redirect rodaria no teste e não em produção.
 */

let db: FakeDB;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(db),
}));

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

const { createCard, updateCard, deleteCard, toggleInvoicePaid } = await import("./actions");

/** Roda a action e devolve o destino do redirect, ou o erro que ela retornou. */
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

const VALID_CARD = {
  name: "Nubank",
  brand: "Mastercard",
  closing_day: "20",
  due_day: "27",
  color: "#8b5cf6",
  last_four: "1234",
};

describe("createCard", () => {
  beforeEach(() => {
    db = createFakeDB({ cards: [] });
  });

  it("grava o cartão com o user_id da sessão e redireciona", async () => {
    const { redirect } = await run(() => createCard(undefined, form(VALID_CARD)));

    expect(redirect).toBe("/cartoes");
    expect(db.tables.cards).toHaveLength(1);
    expect(db.tables.cards[0]).toMatchObject({
      user_id: "user-1",
      name: "Nubank",
      closing_day: 20,
      due_day: 27,
    });
  });

  it("recusa payload inválido sem tocar no banco", async () => {
    const { result } = await run(() =>
      createCard(undefined, form({ ...VALID_CARD, closing_day: "45" })),
    );

    expect(result?.error).toBeTruthy();
    expect(db.tables.cards).toHaveLength(0);
  });

  it("recusa quando não há sessão", async () => {
    db = createFakeDB({ cards: [] }, null);

    const { result } = await run(() => createCard(undefined, form(VALID_CARD)));

    expect(result?.error).toBe("Não autenticado.");
    expect(db.tables.cards).toHaveLength(0);
  });

  it("guarda campos opcionais vazios como null, não como string vazia", async () => {
    await run(() =>
      createCard(undefined, form({ ...VALID_CARD, brand: "", color: "", last_four: "" })),
    );

    expect(db.tables.cards[0]).toMatchObject({ brand: null, color: null, last_four: null });
  });
});

describe("updateCard", () => {
  /** Cartão do usuário da sessão, com uma fatura aberta e uma paga. */
  function seedCard() {
    return createFakeDB({
      cards: [
        { id: "card-1", user_id: "user-1", name: "Nubank", closing_day: 20, due_day: 27 },
      ],
      invoices: [
        {
          id: "inv-open",
          user_id: "user-1",
          card_id: "card-1",
          reference_month: "2025-03-01",
          closing_date: "2025-03-20",
          due_date: "2025-03-27",
          status: "open",
        },
        {
          id: "inv-paid",
          user_id: "user-1",
          card_id: "card-1",
          reference_month: "2025-02-01",
          closing_date: "2025-02-20",
          due_date: "2025-02-27",
          status: "paid",
        },
      ],
    });
  }

  beforeEach(() => {
    db = seedCard();
  });

  it("recalcula as faturas em aberto quando o ciclo muda, e só elas (RN-09)", async () => {
    const { redirect } = await run(() =>
      updateCard("card-1", undefined, form({ ...VALID_CARD, closing_day: "10", due_day: "17" })),
    );

    const open = db.tables.invoices.find((i) => i.id === "inv-open");
    const paid = db.tables.invoices.find((i) => i.id === "inv-paid");

    expect(open).toMatchObject({ closing_date: "2025-03-10", due_date: "2025-03-17" });
    // A fatura paga foi quitada nas datas antigas: reescrevê-la falsearia o
    // histórico.
    expect(paid).toMatchObject({ closing_date: "2025-02-20", due_date: "2025-02-27" });
    expect(redirect).toBe("/cartoes/card-1?faturas_recalculadas=1");
  });

  it("não mexe nas faturas quando o ciclo continua igual", async () => {
    const { redirect } = await run(() => updateCard("card-1", undefined, form(VALID_CARD)));

    expect(db.tables.invoices.find((i) => i.id === "inv-open")).toMatchObject({
      closing_date: "2025-03-20",
    });
    expect(redirect).toBe("/cartoes/card-1");
  });

  // O fake não impõe RLS; o escopo por `user_id` que a action escreve à mão em
  // cada filtro é o que está sendo verificado aqui.
  it("não edita cartão de outro usuário", async () => {
    db = createFakeDB({
      cards: [
        { id: "card-alheio", user_id: "user-2", name: "Do vizinho", closing_day: 5, due_day: 12 },
      ],
    });

    const { result } = await run(() => updateCard("card-alheio", undefined, form(VALID_CARD)));

    expect(result?.error).toBe("Cartão não encontrado.");
    expect(db.tables.cards[0]).toMatchObject({ name: "Do vizinho", closing_day: 5 });
  });
});

describe("deleteCard", () => {
  beforeEach(() => {
    db = createFakeDB({
      cards: [
        { id: "card-1", user_id: "user-1", name: "Nubank", closing_day: 20, due_day: 27 },
        { id: "card-2", user_id: "user-2", name: "Do vizinho", closing_day: 5, due_day: 12 },
      ],
    });
  });

  it("apaga o cartão do usuário e redireciona", async () => {
    const { redirect } = await run(() => deleteCard("card-1"));

    expect(redirect).toBe("/cartoes");
    expect(db.tables.cards.map((c) => c.id)).toEqual(["card-2"]);
  });

  it("não apaga cartão de outro usuário", async () => {
    await run(() => deleteCard("card-2"));

    expect(db.tables.cards).toHaveLength(2);
  });
});

describe("toggleInvoicePaid", () => {
  beforeEach(() => {
    db = createFakeDB({
      invoices: [
        { id: "inv-1", user_id: "user-1", card_id: "card-1", status: "open", paid_at: null },
      ],
    });
  });

  it("marca como paga e carimba a data", async () => {
    const { result } = await run(() => toggleInvoicePaid("inv-1", true));

    expect(result?.error).toBeUndefined();
    expect(db.tables.invoices[0].status).toBe("paid");
    expect(db.tables.invoices[0].paid_at).toEqual(expect.any(String));
  });

  it("desmarcar limpa a data do pagamento", async () => {
    await run(() => toggleInvoicePaid("inv-1", true));
    await run(() => toggleInvoicePaid("inv-1", false));

    expect(db.tables.invoices[0]).toMatchObject({ status: "open", paid_at: null });
  });

  it("recusa quando não há sessão", async () => {
    db = createFakeDB({ invoices: [{ id: "inv-1", user_id: "user-1", status: "open" }] }, null);

    const { result } = await run(() => toggleInvoicePaid("inv-1", true));

    expect(result?.error).toBe("Não autenticado.");
    expect(db.tables.invoices[0].status).toBe("open");
  });
});
