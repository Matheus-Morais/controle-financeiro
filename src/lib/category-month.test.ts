import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createFakeDB, type FakeDB } from "./fake-supabase";
import { budgetSpendingByCategory, categoryMonthItems, totalsByOrigin } from "./category-month";

const asDB = (db: FakeDB) => db as unknown as SupabaseClient<Database>;

const MES = "2026-11-01";
const HOJE = "2026-11-09";

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
  kind: "single",
  installments_count: 1,
  purchase_date: "2026-10-20",
  category_id,
  ...extra,
});

describe("categoryMonthItems", () => {
  const seed = {
    invoices: [
      { card_id: "card-a", reference_month: MES, closing_date: "2026-11-08" },
      { card_id: "card-b", reference_month: MES, closing_date: "2026-11-30" },
      { card_id: "card-b", reference_month: "2026-10-01", closing_date: "2026-10-30" },
    ],
    transactions: [
      tx("t1", "comida"),
      tx("t2", "lazer"),
      tx("t3", null),
      tx("t4", "comida", { kind: "installment", installments_count: 3 }),
      tx("t5", "comida"),
      tx("t6", "comida", { kind: "recurring" }),
      tx("t7", "casa"),
    ],
    installments: [
      parcela("i1", "t1", { amount_cents: 5000 }),
      parcela("i2", "t2"),
      parcela("i3", "t3"),
      parcela("i4", "t4", { number: 2, card_id: "card-b", amount_cents: 2500 }),
      parcela("i5", "t1", { reference_month: "2026-12-01" }), // outro mês
      parcela("i6", "t1", { deleted_at: "2026-11-02T10:00:00Z" }), // excluída
      parcela("i7", "t5", { card_id: "card-b", amount_cents: 55882 }),
      parcela("i8", "t6", { card_id: "card-b", amount_cents: 1500 }),
      parcela("i9", "t7", { card_id: null, account_id: "carteira", amount_cents: 4500 }),
      parcela("i10", "t5", { card_id: "sem-fatura" }),
    ],
  };

  it("devolve só as parcelas da categoria no mês, com valor, cartão e parcela", async () => {
    const items = await categoryMonthItems(asDB(createFakeDB(seed)), MES, HOJE, "comida");
    expect(items.map((i) => i.installmentId).sort()).toEqual(["i1", "i4"]);
    const i4 = items.find((i) => i.installmentId === "i4");
    expect(i4).toMatchObject({ amountCents: 2500, cardId: "card-b", number: 2, installmentsCount: 3 });
  });

  it("ignora parcela de outro mês e parcela excluída", async () => {
    const items = await categoryMonthItems(asDB(createFakeDB(seed)), MES, HOJE, "comida");
    expect(items.map((i) => i.installmentId)).not.toContain("i5");
    expect(items.map((i) => i.installmentId)).not.toContain("i6");
  });

  it("com categoryId null devolve os gastos sem categoria", async () => {
    const items = await categoryMonthItems(asDB(createFakeDB(seed)), MES, HOJE, null);
    expect(items.map((i) => i.installmentId)).toEqual(["i3"]);
  });

  it("devolve lista vazia quando o mês não tem parcelas", async () => {
    const db = createFakeDB(seed);
    expect(await categoryMonthItems(asDB(db), "2030-01-01", HOJE, "comida")).toEqual([]);
    expect(db.queries.filter((q) => q.startsWith("transactions"))).toEqual([]);
  });

  it("conta parcelas de cartão desde o início e inclui compras à vista e assinaturas no fechamento", async () => {
    const db = asDB(createFakeDB(seed));
    expect((await budgetSpendingByCategory(db, MES, "2026-11-01")).get("comida")).toBe(2500);
    expect((await budgetSpendingByCategory(db, MES, "2026-11-08")).get("comida")).toBe(7500);
    expect((await budgetSpendingByCategory(db, MES, "2026-11-29")).get("comida")).toBe(7500);
    expect((await budgetSpendingByCategory(db, MES, "2026-11-30")).get("comida")).toBe(64882);
  });

  it("usa os mesmos valores no resumo e no detalhe, incluindo contas e gastos sem categoria", async () => {
    const db = asDB(createFakeDB(seed));
    const spending = await budgetSpendingByCategory(db, MES, HOJE);
    const items = await categoryMonthItems(db, MES, HOJE, "comida");
    expect(spending.get("comida")).toBe(items.reduce((sum, item) => sum + item.amountCents, 0));
    expect(spending.get("casa")).toBe(4500);
    expect(spending.get("none")).toBe(1000);
  });

  it("pagina parcelas e divide as transações em lotes sem perder lançamentos", async () => {
    const txs = Array.from({ length: 501 }, (_, i) => tx(`x${i}`, "comida"));
    const parcelas = txs.map((t, i) => parcela(`p${i}`, t.id));
    const db = createFakeDB({ invoices: seed.invoices, transactions: txs, installments: parcelas });
    const items = await categoryMonthItems(asDB(db), MES, HOJE, "comida");
    expect(items).toHaveLength(501);
    expect(new Set(items.map((item) => item.installmentId)).size).toBe(501);
    expect(db.queries.filter((q) => q.startsWith("installments")).length).toBe(2);
    expect(db.queries.filter((q) => q.startsWith("transactions")).length).toBe(7);
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
