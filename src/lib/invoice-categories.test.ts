import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createFakeDB, type FakeDB } from "./fake-supabase";
import { categoriesByTransaction } from "./invoice-categories";

const asDB = (db: FakeDB) => db as unknown as SupabaseClient<Database>;

describe("categoriesByTransaction", () => {
  const seed = {
    categories: [
      { id: "cat-comida", name: "Comida – saídas", color: "#f97316" },
      { id: "cat-sem-cor", name: "Outros", color: null },
    ],
    transactions: [
      { id: "t1", category_id: "cat-comida" },
      { id: "t2", category_id: "cat-sem-cor" },
      { id: "t3", category_id: null },
      { id: "t4", category_id: "cat-comida" },
    ],
  };

  it("liga cada transação à sua categoria (nome e cor)", async () => {
    const db = createFakeDB(seed);
    const map = await categoriesByTransaction(asDB(db), ["t1", "t2"]);
    expect(map.get("t1")).toEqual({ name: "Comida – saídas", color: "#f97316" });
    expect(map.get("t2")).toEqual({ name: "Outros", color: null });
  });

  it("deixa transação sem categoria fora do mapa", async () => {
    const db = createFakeDB(seed);
    const map = await categoriesByTransaction(asDB(db), ["t3"]);
    expect(map.has("t3")).toBe(false);
  });

  it("só consulta as transações pedidas", async () => {
    const db = createFakeDB(seed);
    const map = await categoriesByTransaction(asDB(db), ["t1"]);
    expect([...map.keys()]).toEqual(["t1"]);
  });

  it("não vai ao banco quando não há itens", async () => {
    const db = createFakeDB(seed);
    const map = await categoriesByTransaction(asDB(db), []);
    expect(map.size).toBe(0);
    expect(db.queries).toEqual([]);
  });

  it("divide faturas grandes em lotes para não estourar a URL", async () => {
    const many = Array.from({ length: 170 }, (_, i) => ({ id: `tx-${i}`, category_id: "cat-comida" }));
    const db = createFakeDB({ categories: seed.categories, transactions: many });
    const map = await categoriesByTransaction(asDB(db), many.map((t) => t.id));
    expect(map.size).toBe(170);
    expect(db.queries.filter((q) => q.startsWith("transactions")).length).toBe(3); // 80 + 80 + 10
  });
});
