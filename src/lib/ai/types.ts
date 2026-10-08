/**
 * Tipos de domínio para o Assistente IA de Diagnóstico Financeiro.
 *
 * Suporta o modo estruturado (Dossiê em Cartões) e o modo conversacional (Chat).
 */

export type FinancialHealthScore = "otimo" | "atencao" | "critico";

export interface AnomalyItem {
  title: string;
  description: string;
  amountCents?: number;
  severity: "baixa" | "media" | "alta";
  categoryName?: string;
}

export interface BudgetDeviationItem {
  categoryName: string;
  spentCents: number;
  limitCents: number;
  percentUsed: number;
}

export interface ActionPlanItem {
  action: string;
  estimatedSavingsCents?: number;
  priority: "alta" | "media" | "baixa";
}

/** Dossiê estruturado gerado pela IA para renderizar os cartões visuais. */
export interface DossierReport {
  summary: string;
  healthScore: FinancialHealthScore;
  healthScoreLabel: string;
  anomalies: AnomalyItem[];
  budgetDeviations: BudgetDeviationItem[];
  actionPlan: ActionPlanItem[];
}

/** Dados higienizados e agregados do usuário passados como contexto seguro ao LLM. */
export interface FinancialSanitizedContext {
  referenceMonth: string;
  monthLabel: string;
  incomeTotalCents: number;
  toPayTotalCents: number;
  leftoverCents: number;
  invoices: {
    cardName: string;
    amountCents: number;
    dueDate: string;
    state: string;
  }[];
  categorySpendings: {
    name: string;
    spentCents: number;
    limitCents?: number;
  }[];
  topExpenses: {
    description: string;
    amountCents: number;
    date: string;
    categoryName?: string;
  }[];
  recurringExpenses: {
    description: string;
    amountCents: number;
    day: number;
  }[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  dossier?: DossierReport;
  createdAt: string;
}

export interface AnalysisRequestPayload {
  message: string;
  refMonth: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface AnalysisResponsePayload {
  content: string;
  dossier?: DossierReport;
}
