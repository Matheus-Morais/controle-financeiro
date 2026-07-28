import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createFakeDB, type FakeDB } from "./fake-supabase";
import { materializeRecurringExpenses, materializeRecurringIncomes } from "./recurring";

/**
 * A materialização é a lógica assíncrona mais crítica do domínio (RN-24, RN-29)
 * e não tinha nenhum teste — a suíte só cobria módulos puros. Aqui o fake de
 * Supabase permite verificar o EFEITO sobre os dados, não a sequência de
 * chamadas.
 */

const USER = "user-1";
const CARD = "card-1";
const JUL = "2026-07-01";
const AGO = "2026-08-01";

// O fake implementa só o subconjunto do PostgREST que o código usa; o cast
// mantém a assinatura real de `recurring.ts` sob teste.
const asDB = (db: FakeDB) => db as unknown as SupabaseClient<Database>;

describe("materializeRecurringExpenses", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = createFakeDB({
      cards: [{ id: CARD, user_id: USER, closing_day: 10, due_day: 20 }],
      recurring_expenses: [
        {
          id: "rec-1",
          user_id: USER,
          card_id: CARD,
          account_id: null,
          category_id: null,
          description: "Netflix",
          amount_cents: 3990,
          billing_day: 15,
          start_month: "2026-01-01",
          end_month: null,
          active: true,
        },
      ],
      transactions: [],
      installments: [],
      invoices: [],
    });
    // O fake gera ids próprios no seed; fixa o do cartão/assinatura usados abaixo.
    db.tables.cards[0].id = CARD;
    db.tables.recurring_expenses[0].id = "rec-1";
  });

  it("cria transação, parcela e capa de fatura na competência", async () => {
    const created = await materializeRecurringExpenses(asDB(db), USER, AGO);

    expect(created).toBe(1);
    expect(db.tables.transactions).toHaveLength(1);
    expect(db.tables.transactions[0]).toMatchObject({
      kind: "recurring",
      recurring_id: "rec-1",
      // RN-23: billing_day vira purchase_date, não muda a competência.
      purchase_date: "2026-08-15",
    });
    expect(db.tables.installments[0]).toMatchObject({ reference_month: AGO, amount_cents: 3990 });
    expect(db.tables.invoices).toHaveLength(1);
  });

  it("é idempotente: rodar de novo no mesmo mês não duplica (RN-24)", async () => {
    await materializeRecurringExpenses(asDB(db), USER, AGO);
    const second = await materializeRecurringExpenses(asDB(db), USER, AGO);

    expect(second).toBe(0);
    expect(db.tables.transactions).toHaveLength(1);
    expect(db.tables.installments).toHaveLength(1);
  });

  it("competência é o próprio mês, mesmo com billing_day depois do fechamento (RN-23)", async () => {
    // Fecha dia 10, cobra dia 15: uma COMPRA avulsa cairia no mês seguinte.
    await materializeRecurringExpenses(asDB(db), USER, AGO);
    expect(db.tables.installments[0].reference_month).toBe(AGO);
  });

  it("parcela com soft-delete conta como lançada — não ressuscita (RN-24)", async () => {
    await materializeRecurringExpenses(asDB(db), USER, AGO);
    db.tables.installments[0].deleted_at = "2026-08-05T00:00:00Z";

    const again = await materializeRecurringExpenses(asDB(db), USER, AGO);

    expect(again).toBe(0);
    expect(db.tables.installments).toHaveLength(1);
  });

  it("respeita start_month e end_month (RN-22)", async () => {
    db.tables.recurring_expenses[0].start_month = "2026-09-01";
    expect(await materializeRecurringExpenses(asDB(db), USER, AGO)).toBe(0);

    db.tables.recurring_expenses[0].start_month = "2026-01-01";
    db.tables.recurring_expenses[0].end_month = JUL;
    expect(await materializeRecurringExpenses(asDB(db), USER, AGO)).toBe(0);

    db.tables.recurring_expenses[0].end_month = AGO;
    expect(await materializeRecurringExpenses(asDB(db), USER, AGO)).toBe(1);
  });

  it("ignora assinatura pausada", async () => {
    db.tables.recurring_expenses[0].active = false;
    expect(await materializeRecurringExpenses(asDB(db), USER, AGO)).toBe(0);
  });

  it("grava o lote inteiro numa única chamada atômica", async () => {
    // Eram três inserts soltos POR assinatura: uma falha no meio deixava a
    // transação sem parcela — invisível em fatura e relatório — e o tick
    // seguinte criava outra órfã, sem nunca convergir.
    db.tables.recurring_expenses.push({
      id: "rec-2",
      user_id: USER,
      card_id: CARD,
      account_id: null,
      category_id: null,
      description: "Spotify",
      amount_cents: 2190,
      billing_day: 5,
      start_month: "2026-01-01",
      end_month: null,
      active: true,
    });

    const created = await materializeRecurringExpenses(asDB(db), USER, AGO);

    expect(created).toBe(2);
    expect(db.queries.filter((q) => q.startsWith("rpc:"))).toEqual([
      "rpc:materialize_recurring_atomic",
    ]);
    expect(db.tables.transactions).toHaveLength(2);
    expect(db.tables.installments).toHaveLength(2);
    // Uma capa por (cartão, competência): as duas assinaturas dividem a fatura.
    expect(db.tables.invoices).toHaveLength(1);
  });

  it("não deixa transação sem parcela quando a gravação falha", async () => {
    const boom = {
      ...db,
      rpc: () => Promise.resolve({ data: null, error: { code: "23503" } }),
    } as unknown as Parameters<typeof materializeRecurringExpenses>[0];

    expect(await materializeRecurringExpenses(boom, USER, AGO)).toBe(0);
    expect(db.tables.transactions).toHaveLength(0);
    expect(db.tables.installments).toHaveLength(0);
  });
});

describe("materializeRecurringIncomes", () => {
  const salario = {
    user_id: USER,
    description: "Salário",
    amount_cents: 500000,
    receipt_date: "2026-07-05",
    reference_month: JUL,
    is_recurring: true,
    recurring_day: 5,
    recurring_mode: "day_of_month",
    recurring_business_day: null,
    recurring_end_month: null,
  };

  it("copia a renda do mês anterior para a competência", async () => {
    const db = createFakeDB({ incomes: [salario] });

    expect(await materializeRecurringIncomes(asDB(db), USER, AGO)).toBe(1);
    const novo = db.tables.incomes.find((i) => i.reference_month === AGO);
    expect(novo).toMatchObject({ description: "Salário", receipt_date: "2026-08-05" });
  });

  it("é idempotente: não recria o que já existe no mês", async () => {
    const db = createFakeDB({ incomes: [salario] });
    await materializeRecurringIncomes(asDB(db), USER, AGO);

    expect(await materializeRecurringIncomes(asDB(db), USER, AGO)).toBe(0);
    expect(db.tables.incomes.filter((i) => i.reference_month === AGO)).toHaveLength(1);
  });

  it("dedupe usa descrição + valor + modo: homônimas de valores diferentes coexistem", async () => {
    const db = createFakeDB({
      incomes: [
        { ...salario, description: "Freela", amount_cents: 100000 },
        { ...salario, description: "Freela", amount_cents: 250000 },
      ],
    });

    // Com dedupe só por descrição, uma das duas era perdida para sempre.
    expect(await materializeRecurringIncomes(asDB(db), USER, AGO)).toBe(2);
    const agosto = db.tables.incomes.filter((i) => i.reference_month === AGO);
    expect(agosto.map((i) => i.amount_cents).sort()).toEqual([100000, 250000]);
  });

  it("recurring_end_month encerra a repetição (RN-29)", async () => {
    // Julho é a última competência: agosto não deve ser criado.
    const db = createFakeDB({ incomes: [{ ...salario, recurring_end_month: JUL }] });

    expect(await materializeRecurringIncomes(asDB(db), USER, AGO)).toBe(0);
    expect(db.tables.incomes).toHaveLength(1);
  });

  it("a data de encerramento acompanha a cópia — senão a recorrência reviveria", async () => {
    const db = createFakeDB({ incomes: [{ ...salario, recurring_end_month: "2026-09-01" }] });

    await materializeRecurringIncomes(asDB(db), USER, AGO);
    const agosto = db.tables.incomes.find((i) => i.reference_month === AGO);
    expect(agosto?.recurring_end_month).toBe("2026-09-01");
  });

  it("não consulta uma vez por recebimento (era N+1)", async () => {
    const db = createFakeDB({
      incomes: Array.from({ length: 10 }, (_, i) => ({
        ...salario,
        description: `Renda ${i}`,
      })),
    });

    await materializeRecurringIncomes(asDB(db), USER, AGO);

    const selects = db.queries.filter((q) => q === "incomes:select").length;
    expect(selects).toBe(2); // mês anterior + mês de destino, independente do volume
  });

  it("ignora rendas não recorrentes", async () => {
    const db = createFakeDB({ incomes: [{ ...salario, is_recurring: false }] });
    expect(await materializeRecurringIncomes(asDB(db), USER, AGO)).toBe(0);
  });
});
