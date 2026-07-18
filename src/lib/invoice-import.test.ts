import { describe, expect, it } from "vitest";
import {
  buildImportRows,
  dedupeKey,
  importPayloadSchema,
  isImportable,
  matchCategoryByName,
  reconcile,
  stripInstallmentSuffix,
  type ValidatedImportItem,
} from "./invoice-import";

const cats = [
  { id: "c-merc", name: "Mercado" },
  { id: "c-alim", name: "Alimentação" },
  { id: "c-transp", name: "Transporte" },
  { id: "c-outros", name: "Outros" },
];

describe("matchCategoryByName", () => {
  it("casa por nome exato", () => {
    expect(matchCategoryByName("Mercado", cats)).toBe("c-merc");
  });
  it("ignora acento e caixa", () => {
    expect(matchCategoryByName("alimentacao", cats)).toBe("c-alim");
    expect(matchCategoryByName("TRANSPORTE", cats)).toBe("c-transp");
  });
  it("resolve sinônimos comuns", () => {
    expect(matchCategoryByName("supermercado", cats)).toBe("c-merc");
    expect(matchCategoryByName("uber", cats)).toBe("c-transp");
    expect(matchCategoryByName("ifood", cats)).toBe("c-alim");
  });
  it("retorna null para desconhecido, vazio ou sem categorias", () => {
    expect(matchCategoryByName("cripto", cats)).toBeNull();
    expect(matchCategoryByName("", cats)).toBeNull();
    expect(matchCategoryByName(null, cats)).toBeNull();
    expect(matchCategoryByName("Mercado", [])).toBeNull();
  });
  it("nunca inventa id — só retorna ids das categorias passadas", () => {
    const r = matchCategoryByName("supermercado", cats);
    expect(r === null || cats.some((c) => c.id === r)).toBe(true);
  });
});

describe("reconcile", () => {
  it("bate quando a soma é igual ao total", () => {
    expect(reconcile(10000, 10000)).toEqual({ hasTotal: true, deltaCents: 0, ok: true });
  });
  it("aceita diferença dentro da tolerância", () => {
    expect(reconcile(10050, 10000, 100).ok).toBe(true);
  });
  it("sinaliza diferença acima da tolerância", () => {
    const r = reconcile(10200, 10000, 100);
    expect(r.ok).toBe(false);
    expect(r.deltaCents).toBe(200);
  });
  it("sem total extraído, não há o que checar", () => {
    expect(reconcile(10000, null)).toEqual({ hasTotal: false, deltaCents: 0, ok: true });
  });
});

describe("dedupeKey", () => {
  it("é estável e normaliza acento/caixa do nome bruto", () => {
    expect(dedupeKey("CAFÉ", 100, "2026-07-01")).toBe(dedupeKey("cafe", 100, "2026-07-01"));
  });
  it("difere por valor ou data", () => {
    expect(dedupeKey("X", 100, "2026-07-01")).not.toBe(dedupeKey("X", 101, "2026-07-01"));
    expect(dedupeKey("X", 100, "2026-07-01")).not.toBe(dedupeKey("X", 100, "2026-07-02"));
  });
});

describe("isImportable", () => {
  it("importa compra/encargo/outro; pula credito/pagamento", () => {
    expect(isImportable("compra")).toBe(true);
    expect(isImportable("encargo")).toBe(true);
    expect(isImportable("outro")).toBe(true);
    expect(isImportable("credito")).toBe(false);
    expect(isImportable("pagamento")).toBe(false);
  });
});

describe("buildImportRows", () => {
  const items: ValidatedImportItem[] = [
    {
      id: "t1",
      description: "Padaria",
      statementDescription: "EST PAD*1 SP",
      amountCents: 1500,
      purchaseDate: "2026-07-05",
      categoryId: "c-alim",
      installment: null,
      recurringId: null,
    },
    {
      id: "t2",
      description: "Uber",
      statementDescription: "UBER *TRIP",
      amountCents: 2300,
      // data que, pela regra normal (fecha dia 25), cairia em agosto:
      purchaseDate: "2026-07-28",
      categoryId: "c-transp",
      installment: null,
      recurringId: null,
    },
  ];
  const ctx = {
    userId: "u1",
    cardId: "card1",
    referenceMonth: "2026-07-01",
    cycle: { closingDay: 25, dueDay: 5 },
  };

  it("gera uma transação single por item, preservando nome bruto e nome amigável", () => {
    const { transactions } = buildImportRows(items, ctx);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      id: "t1",
      user_id: "u1",
      card_id: "card1",
      account_id: null,
      category_id: "c-alim",
      description: "Padaria",
      kind: "single",
      total_amount_cents: 1500,
      installments_count: 1,
      statement_description: "EST PAD*1 SP",
    });
  });

  it("FORÇA a competência escolhida em todas as parcelas (não espalha por data)", () => {
    const { installments } = buildImportRows(items, ctx);
    expect(installments.map((i) => i.reference_month)).toEqual(["2026-07-01", "2026-07-01"]);
    expect(installments[1].amount_cents).toBe(2300);
    expect(installments[1].transaction_id).toBe("t2");
  });

  it("monta a capa da fatura com fechamento/vencimento da competência", () => {
    const { invoice } = buildImportRows(items, ctx);
    expect(invoice).toEqual({
      user_id: "u1",
      card_id: "card1",
      reference_month: "2026-07-01",
      closing_date: "2026-07-25",
      due_date: "2026-08-05", // dueDay(5) <= closingDay(25) → vence no mês seguinte
      status: "open",
    });
  });

  it("quando há parcela, grava como 'installment' com nº atual/total (sem gerar as futuras)", () => {
    const parc: ValidatedImportItem[] = [
      {
        id: "p1",
        description: "Amazon Marketplace",
        statementDescription: "AMAZON MKTP (1/4)",
        amountCents: 5000,
        purchaseDate: "2026-07-10",
        categoryId: null,
        installment: { number: 1, count: 4 },
        recurringId: null,
      },
    ];
    const { transactions, installments } = buildImportRows(parc, ctx);
    expect(transactions[0]).toMatchObject({
      kind: "installment",
      installments_count: 4,
      description: "Amazon Marketplace",
    });
    expect(installments).toHaveLength(1); // não espalha as parcelas futuras
    expect(installments[0]).toMatchObject({ number: 1, amount_cents: 5000, reference_month: "2026-07-01" });
  });

  it("item marcado como recorrente nasce 'recurring' com recurring_id na competência forçada", () => {
    const rec: ValidatedImportItem[] = [
      {
        id: "r1",
        description: "Netflix",
        statementDescription: "NETFLIX.COM",
        amountCents: 3990,
        purchaseDate: "2026-07-15",
        categoryId: "c-alim",
        // Mesmo com parcela detectada, recorrência tem prioridade e ignora a parcela.
        installment: { number: 2, count: 12 },
        recurringId: "rec-abc",
      },
    ];
    const { transactions, installments } = buildImportRows(rec, ctx);
    expect(transactions[0]).toMatchObject({
      kind: "recurring",
      recurring_id: "rec-abc",
      installments_count: 1,
      description: "Netflix",
    });
    expect(installments).toHaveLength(1);
    expect(installments[0]).toMatchObject({ number: 1, amount_cents: 3990, reference_month: "2026-07-01" });
  });

  it("mantém recurring_id null nos itens comuns", () => {
    const { transactions } = buildImportRows(items, ctx);
    expect(transactions.every((t) => t.recurring_id === null)).toBe(true);
  });
});

describe("stripInstallmentSuffix", () => {
  const parc = { atual: 1, total: 4 };
  it("remove o token de parcela do fim do título", () => {
    expect(stripInstallmentSuffix("Amazon Marketplace (1/4)", parc)).toBe("Amazon Marketplace");
    expect(stripInstallmentSuffix("Loja X 01/04", parc)).toBe("Loja X");
    expect(stripInstallmentSuffix("Curso Parcela 1 de 4", parc)).toBe("Curso");
    expect(stripInstallmentSuffix("Magazine - 3/10", { atual: 3, total: 10 })).toBe("Magazine");
  });
  it("não mexe no título quando não há parcela detectada", () => {
    expect(stripInstallmentSuffix("Restaurante 3/4", null)).toBe("Restaurante 3/4");
    expect(stripInstallmentSuffix("Amazon Marketplace (1/4)", null)).toBe("Amazon Marketplace (1/4)");
  });
  it("preserva o original se sobraria vazio", () => {
    expect(stripInstallmentSuffix("1/4", parc)).toBe("1/4");
  });
});

describe("importPayloadSchema", () => {
  const validItem = {
    description: "Padaria",
    statement_description: "EST PAD*1",
    valor_brl: "15,00",
    purchase_date: "2026-07-05",
    category_id: "",
  };

  it("aceita payload válido", () => {
    const r = importPayloadSchema.safeParse({
      card_id: "11111111-1111-1111-1111-111111111111",
      reference_month: "2026-07-01",
      items: [validItem],
    });
    expect(r.success).toBe(true);
  });

  it("rejeita competência que não seja o dia 01", () => {
    const r = importPayloadSchema.safeParse({
      card_id: "11111111-1111-1111-1111-111111111111",
      reference_month: "2026-07-15",
      items: [validItem],
    });
    expect(r.success).toBe(false);
  });

  it("rejeita lista vazia e item sem valor", () => {
    expect(
      importPayloadSchema.safeParse({
        card_id: "11111111-1111-1111-1111-111111111111",
        reference_month: "2026-07-01",
        items: [],
      }).success,
    ).toBe(false);
    expect(
      importPayloadSchema.safeParse({
        card_id: "11111111-1111-1111-1111-111111111111",
        reference_month: "2026-07-01",
        items: [{ ...validItem, valor_brl: "" }],
      }).success,
    ).toBe(false);
  });
});
