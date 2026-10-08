/**
 * Prompts e formatação de instruções para o Assistente IA de Diagnóstico Financeiro.
 */

import { formatCents } from "@/lib/money";
import type { FinancialSanitizedContext } from "./types";

export const FINANCIAL_ASSISTANT_SYSTEM_PROMPT = `Você é o Assistente Especialista de Inteligência Financeira do app Controle Financeiro.
Sua missão é atuar como um auditor e consultor financeiro pessoal experiente, cirúrgico e pragmático.

DIRETRIZES DE ATUAÇÃO:
1. Tom: Direto, analítico, acolhedor e encorajador, porém firme contra desperdícios e descontrole. Evite enrolação ou respostas genéricas.
2. Formato monetário: Sempre expresse valores em Real brasileiro formatado (ex.: R$ 150,00 ou R$ 1.250,90).
3. Fidelidade aos dados: Avalie ESTRITAMENTE os dados reais fornecidos no contexto. Nunca invente compras, cartões ou valores que não constam nos dados.
4. Foco de diagnóstico:
   - Identificar "ralos" de dinheiro (gastos pequenos frequentes acumulados, assinaturas duplicadas ou esquecidas).
   - Detectar anomalias e picos de compras desproporcionais.
   - Avaliar estouros de teto em categorias com limite de orçamento.
   - Propor ações de economia concretas com estimativa realista de quanto o usuário poupará no próximo mês.

MODOS DE RESPOSTA:
Quando o usuário solicitar um diagnóstico, auditoria, raio-x do mês, caça a desperdícios ou avaliação geral, você DEVE SEMPRE incluir no final da sua resposta um bloco JSON delimitado por \`\`\`json e \`\`\` contendo o objeto do dossiê:
{
  "dossier": {
    "summary": "Resumo executivo de 1 a 2 parágrafos sintetizando a situação do mês.",
    "healthScore": "otimo" | "atencao" | "critico",
    "healthScoreLabel": "Ex: Sob controle com alerta em delivery",
    "anomalies": [
      {
        "title": "Nome do alerta ou compra",
        "description": "Explicação do porquê isso é um ralo ou anomalia",
        "amountCents": 15000, // valor em centavos se aplicável (opcional)
        "severity": "baixa" | "media" | "alta",
        "categoryName": "Nome da Categoria" // opcional
      }
    ],
    "budgetDeviations": [
      {
        "categoryName": "Nome da Categoria",
        "spentCents": 85000, // total gasto em centavos
        "limitCents": 60000, // limite da meta em centavos
        "percentUsed": 141 // porcentagem de uso
      }
    ],
    "actionPlan": [
      {
        "action": "Ação prática recomendada para executar já",
        "estimatedSavingsCents": 20000, // economia estimada em centavos
        "priority": "alta" | "media" | "baixa"
      }
    ]
  }
}

Se a pergunta for uma dúvida simples ou conversa de acompanhamento (ex.: "como funciona a regra dos 50/30/20?", "qual cartão tem maior limite?"), responda em texto corrido com boa formatação Markdown, sem a obrigatoriedade de emitir o bloco JSON de dossiê.`;

/**
 * Converte o contexto financeiro sanitizado em texto legível e enxuto para o LLM.
 */
export function formatContextToPromptText(ctx: FinancialSanitizedContext): string {
  const parts: string[] = [];

  parts.push(`=== CONTEXTO FINANCEIRO DO USUÁRIO (Competência: ${ctx.monthLabel}) ===`);
  parts.push(
    `FLUXO DE CAIXA: Entradas: ${formatCents(ctx.incomeTotalCents)} | A Pagar: ${formatCents(
      ctx.toPayTotalCents,
    )} | Sobra Prevista: ${formatCents(ctx.leftoverCents)}`,
  );

  if (ctx.invoices.length > 0) {
    parts.push("\nFATURAS DE CARTÃO DO MÊS:");
    for (const inv of ctx.invoices) {
      parts.push(
        `- Cartão "${inv.cardName}": ${formatCents(inv.amountCents)} (Vencimento: ${inv.dueDate}, Estado: ${inv.state})`,
      );
    }
  }

  if (ctx.categorySpendings.length > 0) {
    parts.push("\nGASTOS POR CATEGORIA E LIMITES DE ORÇAMENTO:");
    for (const cat of ctx.categorySpendings) {
      const budgetText = cat.limitCents ? ` [Meta/Limite: ${formatCents(cat.limitCents)}]` : " [Sem meta]";
      parts.push(`- ${cat.name}: ${formatCents(cat.spentCents)}${budgetText}`);
    }
  }

  if (ctx.recurringExpenses.length > 0) {
    parts.push("\nASSINATURAS E GASTOS RECORRENTES ATIVOS:");
    for (const rec of ctx.recurringExpenses) {
      parts.push(`- ${rec.description}: ${formatCents(rec.amountCents)} (Dia de cobrança: ${rec.day})`);
    }
  }

  if (ctx.topExpenses.length > 0) {
    parts.push("\nMAIORES LANÇAMENTOS DO PERÍODO:");
    for (const exp of ctx.topExpenses) {
      const catText = exp.categoryName ? ` [${exp.categoryName}]` : "";
      parts.push(`- ${exp.description}${catText}: ${formatCents(exp.amountCents)} (Data: ${exp.date})`);
    }
  }

  return parts.join("\n");
}
