import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createFakeDB, type FakeDB } from "./fake-supabase";
import { categoryMonthItems, totalsByOrigin } from "./category-month";

const asDB = (db: FakeDB) => db as unknown as SupabaseClient<Database>;

const MES = "2026-11-01";

const parcela = (id: string, transaction_id: string, extra: Record<string, unknown> = {}) => ({
  id,
  transaction_id,
  card_id: "card-a",
  account_id: null,
  amount_cents: 1000,
  number: 1,
  due_date: null,
  reference_month: MES,
  deleted_at: null,
  ...extra,
});

const tx = (id: string, category_id: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  description: `gasto ${id}`,
  installments_count: 1,
  purchase_date: "2026-10-20",
  category_id,
  ...extra,
});

describe("categoryMonthItems", () => {
  const seed = {
    transactions: [tx("t1", "comida"), tx("t2", "lazer"), tx("t3", null), tx("t4", "comida", { installments_count: 3 })],
    installments: [
      parcela("i1", "t1", { amount_cents: 5000 }),
      parcela("i2", "t2"),
      parcela("i3", "t3"),
      parcela("i4", "t4", { number: 2, card_id: "card-b", amount_cents: 2500 }),
      parcela("i5", "t1", { reference_month: "2026-12-01" }), // outro mês
      parcela("i6", "t1", { deleted_at: "2026-11-02T10:00:00Z" }), // excluída
    ],
  };

  it("devolve só as parcelas da categoria no mês, com valor, cartão e parcela", async () => {
    const items = await categoryMonthItems(asDB(createFakeDB(seed)), "comida", MES);
    expect(items.map((i) => i.installmentId).sort()).toEqual(["i1", "i4"]);
    const i4 = items.find((i) => i.installmentId === "i4");
    expect(i4).toMatchObject({ amountCents: 2500, cardId: "card-b", number: 2, installmentsCount: 3 });
  });

  it("ignora parcela de outro mês e parcela excluída", async () => {
    const items = await categoryMonthItems(asDB(createFakeDB(seed)), "comida", MES);
    expect(items.map((i) => i.installmentId)).not.toContain("i5");
    expect(items.map((i) => i.installmentId)).not.toContain("i6");
  });

  it("com categoryId null devolve os gastos sem categoria", async () => {
    const items = await categoryMonthItems(asDB(createFakeDB(seed)), null, MES);
    expect(items.map((i) => i.installmentId)).toEqual(["i3"]);
  });

  it("devolve lista vazia quando o mês não tem parcelas", async () => {
    const db = createFakeDB(seed);
    expect(await categoryMonthItems(asDB(db), "comida", "2030-01-01")).toEqual([]);
    expect(db.queries.filter((q) => q.startsWith("transactions"))).toEqual([]);
  });

  it("divide meses grandes em lotes para não estourar a URL", async () => {
    const txs = Array.from({ length: 170 }, (_, i) => tx(`x${i}`, "comida"));
    const parcelas = txs.map((t, i) => parcela(`p${i}`, t.id));
    const db = createFakeDB({ transactions: txs, installments: parcelas });
    const items = await categoryMonthItems(asDB(db), "comida", MES);
    expect(items).toHaveLength(170);
    expect(db.queries.filter((q) => q.startsWith("transactions")).length).toBe(3); // 80 + 80 + 10
  });
});

describe("totalsByOrigin", () => {
  it("soma por cartão e por conta, do maior para o menor", () => {
    const totals = totalsByOrigin([
      { cardId: "a", accountId: null, amountCents: 1000 },
      { cardId: "b", accountId: null, amountCents: 5000 },
      { cardId: "a", accountId: null, amountCents: 2000 },
      { cardId: null, accountId: "carteira", amountCents: 700 },
    ]);
    expect(totals.map((t) => [t.key, t.cents, t.count])).toEqual([
      ["card:b", 5000, 1],
      ["card:a", 3000, 2],
      ["account:carteira", 700, 1],
    ]);
  });

  it("devolve vazio sem itens", () => {
    expect(totalsByOrigin([])).toEqual([]);
  });
});
