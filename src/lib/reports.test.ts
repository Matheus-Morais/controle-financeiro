import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  aggregateInstallmentTotals,
  monthCashFlow,
  monthlyTotals,
  spendingByCategory,
} from "./reports";

/**
 * As agregações passaram para o Postgres (migration 0018), então o que sobra em
 * TypeScript — e é o que se testa aqui — é a TRADUÇÃO da resposta: preencher
 * meses sem gasto, mapear categoria nula, derivar o estado da fatura e fazer a
 * aritmética do fluxo de caixa.
 *
 * O stub devolve uma resposta canônica da RPC de propósito: reproduzir o SQL num
 * fake testaria o fake, não o banco. A correção das próprias queries depende de
 * rodar a migration contra um Postgres.
 */
function stubRpc(responses: Record<string, unknown>) {
  return {
    rpc: (fn: string) =>
      Promise.resolve(
        fn in responses
          ? { data: responses[fn], error: null }
          : { data: null, error: { code: "42883" } },
      ),
  } as unknown as SupabaseClient<Database>;
}

describe("aggregateInstallmentTotals", () => {
  it("soma parcelas por chave (card_id, reference_month)", () => {
    const totals = aggregateInstallmentTotals([
      { card_id: "a", reference_month: "2026-06-01", amount_cents: 1000 },
      { card_id: "a", reference_month: "2026-06-01", amount_cents: 2500 },
      { card_id: "a", reference_month: "2026-07-01", amount_cents: 700 },
      { card_id: "b", reference_month: "2026-06-01", amount_cents: 500 },
    ]);
    expect(totals.get("a|2026-06-01")).toBe(3500);
    expect(totals.get("a|2026-07-01")).toBe(700);
    expect(totals.get("b|2026-06-01")).toBe(500);
    expect(totals.size).toBe(3);
  });

  it("ignora parcelas sem cartão (card_id nulo — gastos à vista)", () => {
    const totals = aggregateInstallmentTotals([
      { card_id: null, reference_month: "2026-06-01", amount_cents: 9999 },
      { card_id: "a", reference_month: "2026-06-01", amount_cents: 100 },
    ]);
    expect(totals.size).toBe(1);
    expect(totals.get("a|2026-06-01")).toBe(100);
  });

  it("lista vazia gera mapa vazio", () => {
    expect(aggregateInstallmentTotals([]).size).toBe(0);
  });

  it("chaves não consultadas convivem sem interferir (produto cartesiano)", () => {
    // A query .in(card_id).in(reference_month) pode trazer combinações que não
    // existem como fatura; o consumidor só lê as chaves que quer, então o
    // excesso apenas ocupa o mapa.
    const totals = aggregateInstallmentTotals([
      { card_id: "a", reference_month: "2026-06-01", amount_cents: 100 },
      { card_id: "b", reference_month: "2026-05-01", amount_cents: 200 },
    ]);
    expect(totals.get("a|2026-06-01")).toBe(100);
    expect(totals.get("a|2026-05-01")).toBeUndefined();
  });
});

describe("spendingByCategory", () => {
  it("indexa por categoria e traduz categoria nula para \"none\"", async () => {
    const db = stubRpc({
      spending_by_category: [
        { category_id: "cat-1", cents: 5000 },
        { category_id: null, cents: 700 },
      ],
    });

    const map = await spendingByCategory(db, "2026-07-01");

    expect(map.get("cat-1")).toBe(5000);
    expect(map.get("none")).toBe(700);
  });

  it("erro da RPC vira mapa vazio, não exceção", async () => {
    expect((await spendingByCategory(stubRpc({}), "2026-07-01")).size).toBe(0);
  });
});

describe("monthlyTotals", () => {
  it("devolve a série completa, com zero nos meses que a RPC não retornou", async () => {
    // O gráfico depende do comprimento e da ordem: mês sem gasto não some, vira 0.
    const db = stubRpc({
      monthly_totals: [
        { reference_month: "2026-07-01", cents: 9000 },
        { reference_month: "2026-05-01", cents: 100 },
      ],
    });

    const series = await monthlyTotals(db, "2026-07-01", 3);

    expect(series).toEqual([
      { month: "2026-05-01", cents: 100 },
      { month: "2026-06-01", cents: 0 },
      { month: "2026-07-01", cents: 9000 },
    ]);
  });

  it("erro da RPC ainda devolve a série zerada do tamanho pedido", async () => {
    const series = await monthlyTotals(stubRpc({}), "2026-07-01", 6);

    expect(series).toHaveLength(6);
    expect(series.every((m) => m.cents === 0)).toBe(true);
  });
});

describe("monthCashFlow", () => {
  const flowResponse = {
    income_cents: 500000,
    cash_spending_cents: 20000,
    invoices: [
      {
        id: "inv-1",
        card_id: "card-1",
        card_name: "Nubank",
        card_color: "#8b5cf6",
        reference_month: "2026-06-01",
        closing_date: "2026-06-10",
        due_date: "2026-07-20",
        status: "open" as const,
        total_cents: 120000,
      },
      {
        id: "inv-2",
        card_id: "card-2",
        card_name: null,
        card_color: null,
        reference_month: "2026-06-01",
        closing_date: "2026-08-02",
        due_date: "2026-07-25",
        status: "open" as const,
        total_cents: 30000,
      },
    ],
  };

  it("soma a pagar e a sobra a partir das faturas e do à vista", async () => {
    const flow = await monthCashFlow(stubRpc({ month_cash_flow: flowResponse }), "2026-07-01", "2026-07-15");

    expect(flow.income).toBe(500000);
    expect(flow.cashSpending).toBe(20000);
    expect(flow.invoicesTotal).toBe(150000);
    expect(flow.toPay).toBe(170000);
    expect(flow.leftover).toBe(330000);
  });

  it("deriva o estado de cada fatura a partir do fechamento e do hoje do usuário", async () => {
    const flow = await monthCashFlow(stubRpc({ month_cash_flow: flowResponse }), "2026-07-01", "2026-07-15");

    // Já fechou em 10/06 → está no período de pagamento.
    expect(flow.invoicesDue[0].state).toBe("to_pay");
    // Fecha só em 02/08 → ainda prevista, embora vença antes.
    expect(flow.invoicesDue[1].state).toBe("forecast");
  });

  it("aplica os fallbacks de nome e cor do cartão", async () => {
    const flow = await monthCashFlow(stubRpc({ month_cash_flow: flowResponse }), "2026-07-01", "2026-07-15");

    expect(flow.invoicesDue[1].cardName).toBe("Cartão");
    expect(flow.invoicesDue[1].cardColor).toBe("#94a3b8");
  });

  it("erro da RPC vira fluxo zerado, não exceção", async () => {
    const flow = await monthCashFlow(stubRpc({}), "2026-07-01", "2026-07-15");

    expect(flow).toEqual({
      income: 0,
      invoicesDue: [],
      invoicesTotal: 0,
      cashSpending: 0,
      toPay: 0,
      leftover: 0,
    });
  });
});
