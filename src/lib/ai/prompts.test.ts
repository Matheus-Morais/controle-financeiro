import { describe, expect, it } from "vitest";
import { formatCents } from "@/lib/money";
import { buildChatMessages, formatContextToPromptText } from "./prompts";
import type { FinancialSanitizedContext } from "./types";

describe("formatContextToPromptText", () => {
  it("converte o contexto financeiro em texto com BRL formatado", () => {
    const mockContext: FinancialSanitizedContext = {
      referenceMonth: "2026-07-01",
      monthLabel: "Julho de 2026",
      incomeTotalCents: 500000,
      toPayTotalCents: 350000,
      leftoverCents: 150000,
      invoices: [
        {
          cardName: "Nubank",
          amountCents: 120000,
          dueDate: "2026-07-10",
          state: "Paga",
        },
      ],
      categorySpendings: [
        {
          name: "Alimentação",
          spentCents: 80000,
          limitCents: 60000,
        },
      ],
      topExpenses: [
        {
          description: "Supermercado",
          amountCents: 45000,
          date: "2026-07-05",
          categoryName: "Alimentação",
        },
      ],
      recurringExpenses: [
        {
          description: "Netflix",
          amountCents: 5590,
          day: 15,
        },
      ],
    };

    const text = formatContextToPromptText(mockContext);

    expect(text).toContain("Julho de 2026");
    expect(text).toContain(`Entradas: ${formatCents(mockContext.incomeTotalCents)}`);
    expect(text).toContain(`A Pagar: ${formatCents(mockContext.toPayTotalCents)}`);
    expect(text).toContain(`Sobra Prevista: ${formatCents(mockContext.leftoverCents)}`);
    expect(text).toContain(`Cartão "Nubank": ${formatCents(120000)}`);
    expect(text).toContain(`Alimentação: ${formatCents(80000)} [Meta/Limite: ${formatCents(60000)}]`);
    expect(text).toContain(`Netflix: ${formatCents(5590)} (Dia de cobrança: 15)`);
    expect(text).toContain(`Supermercado [Alimentação]: ${formatCents(45000)}`);
  });
});

describe("buildChatMessages", () => {
  it("monta mensagem inicial combinando contexto e prompt padrão", () => {
    const messages = buildChatMessages(undefined, "", "CONTEXTO FINANCEIRO");

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("CONTEXTO FINANCEIRO");
    expect(messages[0].content).toContain("SOLICITAÇÃO DO USUÁRIO:");
  });

  it("elimina turnos de usuário pendentes no final do histórico para não gerar duplicatas consecutivas", () => {
    const history = [
      { role: "user", content: "Primeira tentativa que falhou" },
    ];

    const messages = buildChatMessages(history, "Nova pergunta", "CONTEXTO ATUAL");

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("Nova pergunta");
  });

  it("mantém alternância normal quando o assistente respondeu previamente", () => {
    const history = [
      { role: "user", content: "Quanto gastei em delivery?" },
      { role: "assistant", content: "Você gastou R$ 350,00." },
    ];

    const messages = buildChatMessages(history, "E no mês passado?", "CONTEXTO ATUAL");

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[2].role).toBe("user");
    expect(messages[2].content).toContain("E no mês passado?");
    expect(messages[2].content).toContain("DADOS ATUALIZADOS DO MÊS:");
  });
});
