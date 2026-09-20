import { describe, expect, it } from "vitest";
import {
  matchCardByIssuer,
  sumItems,
  toEditableItems,
  type Card,
  type EditableItem,
} from "./import-review";
import type { ExtractedInvoice } from "./invoice-import";

const CATEGORIES = [
  { id: "cat-mercado", name: "Mercado" },
  { id: "cat-transporte", name: "Transporte" },
];

function invoice(partial: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    ult4_digitos: null,
    emissor: null,
    bandeira: null,
    vencimento: null,
    competencia_sugerida: null,
    total_fatura: null,
    itens: [],
    ...partial,
  };
}

function item(partial: Partial<ExtractedInvoice["itens"][number]> = {}) {
  return {
    descricao: "MERCADO XPTO 01/03",
    nome_amigavel: "Mercado XPTO",
    valor_brl: "150,00",
    data: "2025-03-05",
    tipo: "compra" as const,
    parcela: null,
    categoria_sugerida: "Mercado",
    sugerido_recorrente: false,
    ...partial,
  };
}

function card(partial: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    name: "Nubank",
    last_four: null,
    color: null,
    closing_day: 20,
    due_day: 27,
    ...partial,
  };
}

describe("toEditableItems", () => {
  it("usa o nome amigável da IA e guarda o bruto para a dedupe", () => {
    const [it] = toEditableItems(invoice({ itens: [item()] }), CATEGORIES);

    expect(it.description).toBe("Mercado XPTO");
    expect(it.statementDescription).toBe("MERCADO XPTO 01/03");
  });

  it("cai no nome bruto quando a IA não conseguiu limpar", () => {
    const [it] = toEditableItems(
      invoice({ itens: [item({ nome_amigavel: "   " })] }),
      CATEGORIES,
    );

    expect(it.description).toBe("MERCADO XPTO 01/03");
  });

  it("tira o sufixo de parcela do título editável", () => {
    const [it] = toEditableItems(
      invoice({
        itens: [
          item({ nome_amigavel: "Geladeira 2/10", parcela: { atual: 2, total: 10 } }),
        ],
      }),
      CATEGORIES,
    );

    expect(it.description).toBe("Geladeira");
    // A parcela em si continua: é ela que posiciona o gasto no cronograma.
    expect(it.parcela).toEqual({ atual: 2, total: 10 });
  });

  it("casa a categoria sugerida com a do usuário e deixa vazia quando não existe", () => {
    const [mercado, nada] = toEditableItems(
      invoice({
        itens: [item(), item({ categoria_sugerida: "Categoria Inexistente" })],
      }),
      CATEGORIES,
    );

    expect(mercado.categoryId).toBe("cat-mercado");
    expect(nada.categoryId).toBe("");
  });

  it("deixa pagamento da fatura fora da importação (RN-39)", () => {
    const [pagamento] = toEditableItems(
      invoice({ itens: [item({ tipo: "pagamento" })] }),
      CATEGORIES,
    );

    expect(pagamento.importable).toBe(false);
    expect(pagamento.include).toBe(false);
  });

  it("marca compra como incluída por padrão", () => {
    const [compra] = toEditableItems(invoice({ itens: [item()] }), CATEGORIES);

    expect(compra.importable).toBe(true);
    expect(compra.include).toBe(true);
  });

  it("nasce sem vínculo: quem decide match e recorrência é a revisão", () => {
    const [it] = toEditableItems(
      invoice({ itens: [item({ sugerido_recorrente: true })] }),
      CATEGORIES,
    );

    expect(it.match).toBeNull();
    expect(it.linkedRecurringId).toBeNull();
    expect(it.suggestedRecurring).toBe(true);
    // Sugestão da IA não é decisão: o usuário ainda precisa marcar.
    expect(it.markAsRecurring).toBe(false);
  });

  it("dá ids estáveis e distintos para os itens", () => {
    const items = toEditableItems(invoice({ itens: [item(), item(), item()] }), CATEGORIES);

    expect(new Set(items.map((i) => i.id)).size).toBe(3);
  });
});

describe("matchCardByIssuer", () => {
  it("casa quando o nome do cartão aparece no emissor", () => {
    const hit = matchCardByIssuer(invoice({ emissor: "NU PAGAMENTOS - NUBANK" }), [
      card(),
      card({ id: "card-2", name: "Itaú" }),
    ]);

    expect(hit?.id).toBe("card-1");
  });

  it("não escolhe quando há mais de um candidato", () => {
    const hit = matchCardByIssuer(invoice({ emissor: "Banco Inter Gold" }), [
      card({ id: "a", name: "Inter" }),
      card({ id: "b", name: "Inter Gold" }),
    ]);

    expect(hit).toBeUndefined();
  });

  it("não tenta adivinhar com texto curto demais", () => {
    expect(matchCardByIssuer(invoice({ emissor: "NU" }), [card({ name: "NU" })])).toBeUndefined();
  });

  it("ignora acento e caixa", () => {
    const hit = matchCardByIssuer(invoice({ bandeira: "ITAUCARD VISA" }), [
      card({ id: "itau", name: "Itaú" }),
    ]);

    expect(hit?.id).toBe("itau");
  });

  it("devolve indefinido quando a fatura não traz emissor nem bandeira", () => {
    expect(matchCardByIssuer(invoice(), [card()])).toBeUndefined();
  });
});

describe("sumItems", () => {
  const base: EditableItem = {
    id: "x",
    statementDescription: "",
    description: "",
    valorBrl: "10,00",
    purchaseDate: "2025-03-01",
    categoryId: "",
    tipo: "compra",
    parcela: null,
    importable: true,
    include: true,
    match: null,
    linkedRecurringId: null,
    linkedRecurringName: null,
    suggestedRecurring: false,
    markAsRecurring: false,
  };

  it("soma em centavos", () => {
    expect(sumItems([base, { ...base, valorBrl: "5,50" }])).toBe(1550);
  });

  it("trata valor ilegível como zero em vez de quebrar o total", () => {
    expect(sumItems([base, { ...base, valorBrl: "abc" }])).toBe(1000);
  });
});
