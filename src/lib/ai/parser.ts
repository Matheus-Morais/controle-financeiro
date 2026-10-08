/**
 * Parser para extrair texto amigável e Dossiê JSON das respostas do LLM.
 */

import type { DossierReport, FinancialHealthScore } from "./types";

export function parseAssistantResponse(rawText: string): {
  content: string;
  dossier?: DossierReport;
} {
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  if (!jsonMatch) {
    return { content: rawText.trim() };
  }

  let dossier: DossierReport | undefined;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    const obj = parsed.dossier ?? parsed;

    if (obj && typeof obj === "object" && typeof obj.summary === "string") {
      const validScore: FinancialHealthScore = ["otimo", "atencao", "critico"].includes(
        obj.healthScore,
      )
        ? obj.healthScore
        : "atencao";

      dossier = {
        summary: obj.summary,
        healthScore: validScore,
        healthScoreLabel:
          typeof obj.healthScoreLabel === "string" ? obj.healthScoreLabel : "Diagnóstico do Mês",
        anomalies: Array.isArray(obj.anomalies)
          ? obj.anomalies.map((a: any) => ({
              title: String(a.title ?? "Alerta"),
              description: String(a.description ?? ""),
              amountCents: typeof a.amountCents === "number" ? a.amountCents : undefined,
              severity: ["baixa", "media", "alta"].includes(a.severity) ? a.severity : "media",
              categoryName: a.categoryName ? String(a.categoryName) : undefined,
            }))
          : [],
        budgetDeviations: Array.isArray(obj.budgetDeviations)
          ? obj.budgetDeviations.map((b: any) => ({
              categoryName: String(b.categoryName ?? "Geral"),
              spentCents: Number(b.spentCents ?? 0),
              limitCents: Number(b.limitCents ?? 0),
              percentUsed: Number(b.percentUsed ?? 0),
            }))
          : [],
        actionPlan: Array.isArray(obj.actionPlan)
          ? obj.actionPlan.map((p: any) => ({
              action: String(p.action ?? ""),
              estimatedSavingsCents:
                typeof p.estimatedSavingsCents === "number" ? p.estimatedSavingsCents : undefined,
              priority: ["baixa", "media", "alta"].includes(p.priority) ? p.priority : "media",
            }))
          : [],
      };
    }
  } catch {
    // Se o JSON falhar no parse, mantém o texto integral
  }

  // Remove o bloco ```json do texto visível para uma leitura limpa no chat
  const content = rawText.replace(jsonMatch[0], "").trim();

  return {
    content: content || (dossier ? dossier.summary : rawText.trim()),
    dossier,
  };
}
