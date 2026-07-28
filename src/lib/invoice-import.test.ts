import { describe, expect, it } from "vitest";
import {
  buildImportRows,
  classifyReviewItem,
  dedupeKey,
  importPayloadSchema,
  installmentSignature,
  isImportable,
  matchCategoryByName,
  matchExistingOccurrence,
  matchExistingRecurring,
  reconcile,
  resolveInvoiceItem,
  stripInstallmentSuffix,
  type ExistingOccurrence,
  type ExistingRecurring,
  type MatchableItem,
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

describe("installmentSignature", () => {
  it("é estável quando só muda o CONTADOR de parcela no nome (o bug)", () => {
    // Mesma compra, faturas de meses diferentes: "01/03" vira "02/03" no nome.
    const s1 = installmentSignature("LOJA X 01/03", 20000, 3);
    const s2 = installmentSignature("LOJA X 02/03", 20000, 3);
    const s3 = installmentSignature("LOJA X 03/03", 20000, 3);
    expect(s1).toBe(s2);
    expect(s2).toBe(s3);
  });

  it("remove o contador em vários formatos e ignora acento/caixa", () => {
    const base = installmentSignature("Magazine", 5000, 4);
    expect(installmentSignature("MAGAZINE (1/4)", 5000, 4)).toBe(base);
    expect(installmentSignature("Magazine 1/4", 5000, 4)).toBe(base);
    expect(installmentSignature("Magazine Parcela 1 de 4", 5000, 4)).toBe(base);
    expect(installmentSignature("MAGAZINE PARC 01/04", 5000, 4)).toBe(base);
  });

  it("NÃO depende da data da compra (a IA pode reinterpretar entre faturas)", () => {
    // A assinatura não recebe data — duas leituras da mesma compra colidem.
    expect(installmentSignature("LOJA X 01/03", 20000, 3)).toBe(
      installmentSignature("LOJA X 02/03", 20000, 3),
    );
  });

  it("diferencia por valor da parcela ou total de parcelas (compras distintas)", () => {
    // Comprar parcelado no MESMO lugar mais de uma vez: nome igual, mas valor
    // ou nº de parcelas diferente ⇒ assinaturas diferentes (não é duplicata).
    const base = installmentSignature("LOJA X 01/03", 20000, 3);
    expect(installmentSignature("LOJA X 01/06", 20000, 6)).not.toBe(base); // total difere
    expect(installmentSignature("LOJA X 01/03", 15000, 3)).not.toBe(base); // valor difere
  });
});

describe("matchExistingOccurrence", () => {
  const REF = "2026-08-01";

  // Assinatura materializada pelo cron: sem nome bruto, data = billing_day.
  const netflixDoCron: ExistingOccurrence = {
    transactionId: "tx-net",
    kind: "recurring",
    statementDescription: null,
    description: "Netflix",
    amountCents: 3990,
    purchaseDate: "2026-08-15",
    referenceMonth: REF,
    number: 1,
    installmentsCount: 1,
    recurringId: "rec-net",
    deleted: false,
  };
  // Parcela de um parcelamento importado em julho: a cadeia inteira (1..10) já
  // foi materializada, então a ocorrência vive em OUTRA competência.
  const parcelaPropagada: ExistingOccurrence = {
    transactionId: "tx-loja",
    kind: "installment",
    statementDescription: "LOJA X 01/10",
    description: "Loja X",
    amountCents: 20000,
    purchaseDate: "2026-07-10",
    referenceMonth: "2026-09-01",
    number: 3,
    installmentsCount: 10,
    recurringId: null,
    deleted: false,
  };
  const padaria: ExistingOccurrence = {
    transactionId: "tx-pad",
    kind: "single",
    statementDescription: "EST PAD*1 SP",
    description: "Padaria",
    amountCents: 1500,
    purchaseDate: "2026-08-05",
    referenceMonth: REF,
    number: 1,
    installmentsCount: 1,
    recurringId: null,
    deleted: false,
  };
  const todas = [netflixDoCron, parcelaPropagada, padaria];

  const item = (over: Partial<MatchableItem>): MatchableItem => ({
    statementDescription: "X",
    description: "X",
    amountCents: 100,
    purchaseDate: "2026-08-01",
    parcela: null,
    ...over,
  });

  it("casa recorrente materializado pelo cron mesmo sem nome bruto, com data e valor diferentes", () => {
    const m = matchExistingOccurrence(
      item({
        statementDescription: "PP*NETFLIX.COM",
        description: "Netflix",
        amountCents: 4490, // assinatura reajustou
        purchaseDate: "2026-08-10", // data impressa != billing_day
      }),
      todas,
      REF,
    );
    expect(m?.transactionId).toBe("tx-net");
  });

  it("casa o gasto lançado À MÃO na competência (sem nome bruto)", () => {
    // Só a importação grava `statement_description`. Sem este nível, quem lança
    // as compras durante o mês recebia tudo duplicado ao subir a fatura.
    const manual: ExistingOccurrence = {
      transactionId: "tx-manual",
      kind: "single",
      statementDescription: null,
      description: "Mercado",
      amountCents: 8790,
      purchaseDate: "2026-08-12",
      referenceMonth: REF,
      number: 1,
      installmentsCount: 1,
      recurringId: null,
      deleted: false,
    };
    const m = matchExistingOccurrence(
      item({
        statementDescription: "SUPERMERCADO BOM PRECO",
        description: "Mercado",
        amountCents: 8790,
        purchaseDate: "2026-08-12",
      }),
      [...todas, manual],
      REF,
    );
    expect(m?.transactionId).toBe("tx-manual");
  });

  it("gasto manual de mesmo nome mas outro valor/data continua sendo item novo", () => {
    const manual: ExistingOccurrence = {
      transactionId: "tx-manual",
      kind: "single",
      statementDescription: null,
      description: "Mercado",
      amountCents: 8790,
      purchaseDate: "2026-08-12",
      referenceMonth: REF,
      number: 1,
      installmentsCount: 1,
      recurringId: null,
      deleted: false,
    };
    const outroValor = matchExistingOccurrence(
      item({ statementDescription: "MERCADO", description: "Mercado", amountCents: 5000, purchaseDate: "2026-08-12" }),
      [manual],
      REF,
    );
    const outraData = matchExistingOccurrence(
      item({ statementDescription: "MERCADO", description: "Mercado", amountCents: 8790, purchaseDate: "2026-08-20" }),
      [manual],
      REF,
    );
    expect(outroValor).toBeNull();
    expect(outraData).toBeNull();
  });

  it("casa a parcela pela assinatura, mesmo com o contador e o mês diferentes", () => {
    const m = matchExistingOccurrence(
      item({
        statementDescription: "LOJA X 02/10",
        description: "Loja X",
        amountCents: 20000,
        purchaseDate: "2026-07-11", // a fatura nova pode reimprimir outra data
        parcela: { atual: 2, total: 10 },
      }),
      todas,
      REF,
    );
    expect(m?.transactionId).toBe("tx-loja");
  });

  it("parcelamento NOVO no mesmo lugar (outro valor/total) não é duplicata", () => {
    const m = matchExistingOccurrence(
      item({
        statementDescription: "LOJA X 01/06",
        description: "Loja X",
        amountCents: 15000,
        purchaseDate: "2026-08-02",
        parcela: { atual: 1, total: 6 },
      }),
      todas,
      REF,
    );
    expect(m).toBeNull();
  });

  it("casa pela chave exata quando o MESMO PDF é subido de novo", () => {
    const m = matchExistingOccurrence(
      item({
        statementDescription: "EST PAD*1 SP",
        description: "Padaria",
        amountCents: 1500,
        purchaseDate: "2026-08-05",
      }),
      todas,
      REF,
    );
    expect(m?.transactionId).toBe("tx-pad");
  });

  it("chave exata só vale na competência importada", () => {
    const m = matchExistingOccurrence(
      item({
        statementDescription: "EST PAD*1 SP",
        description: "Padaria",
        amountCents: 1500,
        purchaseDate: "2026-08-05",
      }),
      todas,
      "2026-09-01",
    );
    expect(m).toBeNull();
  });

  it("recorrente lançado em OUTRO mês não conta como já importado nesta competência", () => {
    const m = matchExistingOccurrence(
      item({ statementDescription: "PP*NETFLIX.COM", description: "Netflix", amountCents: 3990 }),
      todas,
      "2026-09-01",
    );
    expect(m).toBeNull();
  });

  it("compra nova no mesmo estabelecimento de um gasto à vista já lançado NÃO é duplicata", () => {
    const m = matchExistingOccurrence(
      item({
        statementDescription: "EST PAD*1 SP",
        description: "Padaria",
        amountCents: 2500,
        purchaseDate: "2026-08-19",
      }),
      todas,
      REF,
    );
    expect(m).toBeNull();
  });

  it("sem nada gravado no cartão, nada casa", () => {
    expect(matchExistingOccurrence(item({}), [], REF)).toBeNull();
  });
});

describe("matchExistingRecurring", () => {
  const assinaturas: ExistingRecurring[] = [
    {
      id: "rec-spot",
      description: "Assinatura de música", // nome do template não lembra a marca
      amountCents: 2190,
      aliases: ["SPOTIFY BR"], // …mas o nome bruto de faturas passadas lembra
      materialized: false,
    },
  ];

  it("casa pelo apelido (nome bruto de faturas anteriores)", () => {
    const m = matchExistingRecurring(
      {
        statementDescription: "SPOTIFY BR SAO PAULO",
        description: "Spotify",
        amountCents: 2190,
        purchaseDate: "2026-08-03",
        parcela: null,
      },
      assinaturas,
    );
    expect(m?.id).toBe("rec-spot");
  });

  it("não casa lançamento sem relação", () => {
    const m = matchExistingRecurring(
      {
        statementDescription: "UBER *TRIP",
        description: "Uber",
        amountCents: 2190,
        purchaseDate: "2026-08-03",
        parcela: null,
      },
      assinaturas,
    );
    expect(m).toBeNull();
  });
});

describe("resolveInvoiceItem", () => {
  const spotifyLancado: ExistingOccurrence = {
    transactionId: "tx-spot",
    kind: "recurring",
    statementDescription: null,
    description: "Assinatura de música", // não lembra a marca impressa na fatura
    amountCents: 2190,
    purchaseDate: "2026-08-03",
    referenceMonth: "2026-08-01",
    number: 1,
    installmentsCount: 1,
    recurringId: "rec-spot",
    deleted: false,
  };
  const template = (materialized: boolean): ExistingRecurring => ({
    id: "rec-spot",
    description: "Assinatura de música",
    amountCents: 2190,
    aliases: ["SPOTIFY BR"],
    materialized,
  });
  const linha: MatchableItem = {
    statementDescription: "SPOTIFY BR",
    description: "Spotify",
    amountCents: 2190,
    purchaseDate: "2026-08-05",
    parcela: null,
  };

  it("assinatura JÁ lançada no mês vira 'já importado', mesmo casando só pelo apelido", () => {
    const r = resolveInvoiceItem(linha, [spotifyLancado], [template(true)], "2026-08-01");
    expect(r.match?.transactionId).toBe("tx-spot");
  });

  it("assinatura cadastrada mas ainda não lançada é item novo vinculado ao template", () => {
    const r = resolveInvoiceItem(linha, [], [template(false)], "2026-08-01");
    expect(r.match).toBeNull();
    expect(r.recurring?.id).toBe("rec-spot");
  });

  it("lançamento sem relação nenhuma fica novo e solto", () => {
    const r = resolveInvoiceItem(
      { ...linha, statementDescription: "PADARIA", description: "Padaria" },
      [spotifyLancado],
      [template(true)],
      "2026-08-01",
    );
    expect(r).toEqual({ match: null, recurring: null });
  });
});

describe("classifyReviewItem", () => {
  const occ = (over: Partial<ExistingOccurrence>): ExistingOccurrence => ({
    transactionId: "tx",
    kind: "single",
    statementDescription: null,
    description: "X",
    amountCents: 100,
    purchaseDate: "2026-08-01",
    referenceMonth: "2026-08-01",
    number: 1,
    installmentsCount: 1,
    recurringId: null,
    deleted: false,
    ...over,
  });

  it("separa novos por natureza do gasto", () => {
    expect(classifyReviewItem({ match: null, parcela: null })).toBe("new-single");
    expect(classifyReviewItem({ match: null, parcela: { atual: 1, total: 4 } })).toBe(
      "new-installment",
    );
    expect(classifyReviewItem({ match: null, parcela: null, markAsRecurring: true })).toBe(
      "new-recurring",
    );
  });

  it("item vinculado a assinatura existente é recorrente, mesmo com parcela detectada", () => {
    expect(
      classifyReviewItem({
        match: null,
        parcela: { atual: 2, total: 12 },
        linkedRecurringId: "rec-net",
      }),
    ).toBe("new-recurring");
  });

  it("já importado herda a natureza da ocorrência gravada", () => {
    expect(classifyReviewItem({ match: occ({}), parcela: null })).toBe("existing-single");
    expect(
      classifyReviewItem({ match: occ({ installmentsCount: 10, number: 2 }), parcela: null }),
    ).toBe("existing-installment");
    expect(classifyReviewItem({ match: occ({ recurringId: "rec-net" }), parcela: null })).toBe(
      "existing-recurring",
    );
  });

  it("já importado vence a marcação de recorrente feita agora", () => {
    expect(
      classifyReviewItem({ match: occ({}), parcela: null, markAsRecurring: true }),
    ).toBe("existing-single");
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

  it("monta a capa da fatura (única competência) com fechamento/vencimento", () => {
    const { invoices } = buildImportRows(items, ctx);
    expect(invoices).toEqual([
      {
        user_id: "u1",
        card_id: "card1",
        reference_month: "2026-07-01",
        closing_date: "2026-07-25",
        due_date: "2026-08-05", // dueDay(5) <= closingDay(25) → vence no mês seguinte
        status: "open",
      },
    ]);
  });

  it("propaga as parcelas futuras (atual+1..total) para as competências seguintes", () => {
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
    const { transactions, installments, invoices } = buildImportRows(parc, ctx);
    expect(transactions[0]).toMatchObject({
      kind: "installment",
      installments_count: 4,
      description: "Amazon Marketplace",
      // `total_amount_cents` é o TOTAL da compra, igual ao lançamento manual: a
      // fatura mostra o valor da PARCELA (5000). Guardar a parcela aqui fazia a
      // tela de edição dividi-la de novo por 4 ao salvar (RN-04).
      total_amount_cents: 20000,
    });
    expect(installments).toHaveLength(4);
    expect(installments.map((i) => [i.number, i.reference_month])).toEqual([
      [1, "2026-07-01"],
      [2, "2026-08-01"],
      [3, "2026-09-01"],
      [4, "2026-10-01"],
    ]);
    expect(installments.every((i) => i.amount_cents === 5000)).toBe(true);
    // Uma capa de fatura por competência tocada.
    expect(invoices.map((i) => i.reference_month)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
  });

  it("propaga só as parcelas restantes quando a fatura já está no meio (3/10)", () => {
    const parc: ValidatedImportItem[] = [
      {
        id: "p2",
        description: "Notebook",
        statementDescription: "LOJA X 03/10",
        amountCents: 20000,
        purchaseDate: "2026-05-10",
        categoryId: null,
        installment: { number: 3, count: 10 },
        recurringId: null,
      },
    ];
    const { transactions, installments } = buildImportRows(parc, ctx);
    // Não cria as anteriores (1 e 2); começa na 3, na competência forçada.
    expect(installments).toHaveLength(8);
    expect(installments[0]).toMatchObject({ number: 3, reference_month: "2026-07-01" });
    expect(installments[installments.length - 1]).toMatchObject({
      number: 10,
      reference_month: "2027-02-01",
    });
    // O total é o da compra inteira (10 × 20000), mesmo com só 8 parcelas
    // gravadas — as duas primeiras vivem em faturas passadas.
    expect(transactions[0].total_amount_cents).toBe(200000);
    expect(installments.every((i) => i.amount_cents === 20000)).toBe(true);
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
