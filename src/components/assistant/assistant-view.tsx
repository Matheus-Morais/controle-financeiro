"use client";

import { useEffect, useState, useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Cloud,
  Cpu,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  TrendingDown,
  Zap,
} from "lucide-react";
import { formatCents } from "@/lib/money";
import { Money } from "@/components/money";
import type {
  ActionPlanItem,
  AnomalyItem,
  BudgetDeviationItem,
  ChatMessage,
  DossierReport,
  FinancialHealthScore,
} from "@/lib/ai/types";
import {
  checkGemmaAvailability,
  promptGemma,
  type LocalAiStatus,
} from "@/lib/ai/client-gemma";
import { parseAssistantResponse } from "@/lib/ai/parser";

interface AssistantViewProps {
  refMonth: string;
  monthLabel: string;
}

const QUICK_ACTIONS = [
  {
    label: "Raio-X do Mês",
    icon: Sparkles,
    prompt:
      "Faça um diagnóstico geral da minha saúde financeira neste mês, avaliando entradas vs saídas, faturas e maiores gastos.",
  },
  {
    label: "Caçar Ralos",
    icon: TrendingDown,
    prompt:
      "Identifique ralos de dinheiro, gastos atípicos, assinaturas esquecidas e pequenos gastos acumulados que posso cortar.",
  },
  {
    label: "Auditar Metas",
    icon: Target,
    prompt:
      "Avalie todas as categorias que estouraram ou estão próximas do limite e diga como reequilibrar meu orçamento.",
  },
  {
    label: "Economizar R$ 300",
    icon: Zap,
    prompt:
      "Me aponte um plano cirúrgico para economizar pelo menos R$ 300 no próximo mês sem comprometer o básico.",
  },
];

export function AssistantView({ refMonth, monthLabel }: AssistantViewProps) {
  const [engine, setEngine] = useState<"claude" | "gemma">("claude");
  const [gemmaStatus, setGemmaStatus] = useState<LocalAiStatus>({
    available: false,
    modelName: "Gemma (No Aparelho)",
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentDossier, setCurrentDossier] = useState<DossierReport | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Checa se o aparelho possui Prompt API (Gemma / Gemini Nano) nativo
  useEffect(() => {
    checkGemmaAvailability().then((status) => {
      setGemmaStatus(status);
      if (status.available) {
        setEngine("gemma"); // Se tiver IA local no celular, prioriza!
      }
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentDossier, loading]);

  async function handleSend(customPrompt?: string) {
    const textToSend = (customPrompt ?? input).trim();
    if (!textToSend || loading) return;

    setError(null);
    setInput("");
    setLoading(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      if (engine === "gemma" && gemmaStatus.available) {
        // Fluxo local via Prompt API no celular
        const contextRes = await fetch("/api/ia/analise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refMonth, action: "context" }),
        });

        if (!contextRes.ok) {
          throw new Error("Não foi possível carregar os dados financeiros para a IA local.");
        }

        const { contextText, systemPrompt } = await contextRes.json();
        const fullPrompt = `${contextText}\n\nSOLICITAÇÃO DO USUÁRIO:\n${textToSend}`;

        const rawResponse = await promptGemma(systemPrompt, fullPrompt);
        const parsed = parseAssistantResponse(rawResponse);

        if (parsed.dossier) {
          setCurrentDossier(parsed.dossier);
        }

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: parsed.content,
          dossier: parsed.dossier,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Fluxo em nuvem via Claude API no servidor
        const res = await fetch("/api/ia/analise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refMonth,
            message: textToSend,
            history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Erro ao consultar o assistente.");
        }

        if (data.dossier) {
          setCurrentDossier(data.dossier);
        }

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.content,
          dossier: data.dossier,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (err: any) {
      console.error("[assistant] erro:", err);
      setError(err?.message || "Ocorreu um erro ao gerar a análise.");
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      if (!customPrompt) {
        setInput(textToSend);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* Topo: Identificação e Seletor de Motor */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Sparkles size={18} />
            </span>
            <h1 className="text-xl font-bold">Assistente Financeiro IA</h1>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            Avaliando competência de <span className="font-semibold text-neutral-700 dark:text-neutral-300">{monthLabel}</span>
          </p>
        </div>

        {/* Badge / Seletor de Motor IA */}
        <div className="flex items-center gap-1.5 rounded-xl bg-neutral-100 p-1 text-xs dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => setEngine("claude")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition ${
              engine === "claude"
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
            }`}
          >
            <Cloud size={14} className="text-brand" />
            <span>Claude (Nuvem)</span>
          </button>

          {gemmaStatus.available && (
            <button
              type="button"
              onClick={() => setEngine("gemma")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium transition ${
                engine === "gemma"
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              <Cpu size={14} className="text-emerald-500" />
              <span>Gemma (Aparelho)</span>
            </button>
          )}
        </div>
      </div>

      {/* Aviso do motor em uso */}
      {engine === "gemma" && gemmaStatus.available && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <Cpu size={15} className="shrink-0" />
          <span>Executando 100% no seu aparelho celular via Prompt API (Privado & Sem Custo).</span>
        </div>
      )}

      {/* Atalhos Rápidos de 1 Toque */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-neutral-500">Atalhos de diagnóstico rápido:</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_ACTIONS.map(({ label, icon: Icon, prompt }) => (
            <button
              key={label}
              type="button"
              disabled={loading}
              onClick={() => handleSend(prompt)}
              className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 text-left text-xs font-medium transition active:scale-95 hover:border-brand/40 dark:border-neutral-800 dark:bg-neutral-900 disabled:opacity-50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon size={15} />
              </span>
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mensagem de Erro se houver */}
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded px-1.5 py-0.5 text-xs text-red-500/80 transition hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"
            aria-label="Dispensar aviso de erro"
          >
            ✕
          </button>
        </div>
      )}

      {/* Dossiê Estruturado em Cartões (se gerado) */}
      {currentDossier && (
        <div className="flex flex-col gap-4 animate-month-in motion-reduce:animate-none">
          {/* 1. Card de Saúde & Resumo */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Raio-X da Competência
              </span>
              <HealthScoreBadge score={currentDossier.healthScore} label={currentDossier.healthScoreLabel} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {currentDossier.summary}
            </p>
          </div>

          {/* 2. Ralos e Gastos Atípicos */}
          {currentDossier.anomalies.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                <AlertTriangle size={16} className="text-rose-500" />
                <span>Ralos e Gastos Atípicos Detectados</span>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {currentDossier.anomalies.map((ano, idx) => (
                  <AnomalyCard key={idx} anomaly={ano} />
                ))}
              </div>
            </div>
          )}

          {/* 3. Desvios de Orçamento */}
          {currentDossier.budgetDeviations.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                <Target size={16} className="text-amber-500" />
                <span>Situação das Metas de Orçamento</span>
              </h2>
              <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
                {currentDossier.budgetDeviations.map((dev, idx) => (
                  <BudgetDeviationRow key={idx} item={dev} />
                ))}
              </div>
            </div>
          )}

          {/* 4. Plano de Ação Recomendado */}
          {currentDossier.actionPlan.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                <CheckCircle2 size={16} className="text-brand" />
                <span>Plano de Ação para Economia</span>
              </h2>
              <div className="flex flex-col gap-2">
                {currentDossier.actionPlan.map((act, idx) => (
                  <ActionPlanCard key={idx} item={act} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Histórico Interativo de Chat */}
      {messages.length > 0 && (
        <div className="flex flex-col gap-3 pt-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Diálogo de Aprofundamento
          </h2>
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "self-end bg-brand text-white rounded-br-sm"
                    : "self-start bg-neutral-200/70 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}

            {loading && (
              <div className="self-start flex items-center gap-2 rounded-2xl bg-neutral-200/50 px-4 py-2.5 text-xs text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-400">
                <Loader2 size={14} className="animate-spin text-brand" />
                <span>O assistente está analisando seus dados...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Barra de Pergunta Livre (Input) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="sticky bottom-20 mt-2 flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-1.5 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte ou peça uma avaliação personalizada..."
          disabled={loading}
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-neutral-400"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition active:scale-95 disabled:opacity-40"
          aria-label="Enviar pergunta"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}

function HealthScoreBadge({
  score,
  label,
}: {
  score: FinancialHealthScore;
  label: string;
}) {
  const STYLES = {
    otimo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    atencao: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    critico: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        STYLES[score] ?? STYLES.atencao
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span>{label}</span>
    </span>
  );
}

function AnomalyCard({ anomaly }: { anomaly: AnomalyItem }) {
  const SEVERITY_COLORS = {
    alta: "border-rose-500/30 bg-rose-500/5",
    media: "border-amber-500/30 bg-amber-500/5",
    baixa: "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900",
  };

  return (
    <div
      className={`flex flex-col justify-between rounded-xl border p-3 ${
        SEVERITY_COLORS[anomaly.severity]
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
            {anomaly.title}
          </p>
          {anomaly.amountCents != null && (
            <span className="text-xs font-bold text-rose-500">
              <Money cents={anomaly.amountCents} />
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          {anomaly.description}
        </p>
      </div>
      {anomaly.categoryName && (
        <span className="mt-2 text-[10px] uppercase tracking-wider text-neutral-400">
          {anomaly.categoryName}
        </span>
      )}
    </div>
  );
}

function BudgetDeviationRow({ item }: { item: BudgetDeviationItem }) {
  const isOver = item.percentUsed > 100;
  const isWarning = item.percentUsed >= 80;

  return (
    <div className="flex flex-col gap-1 border-b border-neutral-100 py-2 last:border-0 dark:border-neutral-800">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-neutral-800 dark:text-neutral-200">
          {item.categoryName}
        </span>
        <span className="font-semibold">
          <Money cents={item.spentCents} /> / <Money cents={item.limitCents} />
          <span
            className={`ml-1.5 font-bold ${
              isOver ? "text-rose-500" : isWarning ? "text-amber-500" : "text-emerald-500"
            }`}
          >
            ({item.percentUsed}%)
          </span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className={`h-full rounded-full ${
            isOver ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${Math.min(item.percentUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ActionPlanCard({ item }: { item: ActionPlanItem }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <ArrowRight size={12} />
        </span>
        <p className="text-xs leading-relaxed text-neutral-800 dark:text-neutral-200">
          {item.action}
        </p>
      </div>
      {item.estimatedSavingsCents != null && item.estimatedSavingsCents > 0 && (
        <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
          + <Money cents={item.estimatedSavingsCents} />
        </span>
      )}
    </div>
  );
}
