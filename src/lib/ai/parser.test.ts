import { describe, expect, it } from "vitest";
import { parseAssistantResponse } from "./parser";

describe("parseAssistantResponse", () => {
  it("retorna texto simples quando não há bloco JSON", () => {
    const raw = "Você gastou R$ 1.500 este mês, sendo a maior parte em moradia.";
    const result = parseAssistantResponse(raw);

    expect(result.content).toBe(raw);
    expect(result.dossier).toBeUndefined();
  });

  it("extrai dossiê estruturado e remove o bloco ```json do texto corrido", () => {
    const raw = `Olá! Analisei seus gastos e preparei o raio-x abaixo.

\`\`\`json
{
  "dossier": {
    "summary": "Mês sob controle, mas com alerta de estouro em delivery.",
    "healthScore": "atencao",
    "healthScoreLabel": "Atenção a supérfluos",
    "anomalies": [
      {
        "title": "Delivery frequente",
        "description": "8 pedidos no mês somando R$ 420",
        "amountCents": 42000,
        "severity": "alta",
        "categoryName": "Alimentação"
      }
    ],
    "budgetDeviations": [
      {
        "categoryName": "Lazer",
        "spentCents": 55000,
        "limitCents": 40000,
        "percentUsed": 137
      }
    ],
    "actionPlan": [
      {
        "action": "Reduzir pedidos de delivery para 1x na semana",
        "estimatedSavingsCents": 20000,
        "priority": "alta"
      }
    ]
  }
}
\`\`\``;

    const result = parseAssistantResponse(raw);

    expect(result.content).toBe("Olá! Analisei seus gastos e preparei o raio-x abaixo.");
    expect(result.dossier).toBeDefined();
    expect(result.dossier?.healthScore).toBe("atencao");
    expect(result.dossier?.anomalies).toHaveLength(1);
    expect(result.dossier?.anomalies[0].amountCents).toBe(42000);
    expect(result.dossier?.budgetDeviations[0].percentUsed).toBe(137);
    expect(result.dossier?.actionPlan[0].estimatedSavingsCents).toBe(20000);
  });

  it("tolera JSON malformado sem quebrar a aplicação", () => {
    const raw = `Texto explicativo.
\`\`\`json
{ invalid json syntax ...
\`\`\``;

    const result = parseAssistantResponse(raw);
    expect(result.content).toBe("Texto explicativo.");
    expect(result.dossier).toBeUndefined();
  });
});
