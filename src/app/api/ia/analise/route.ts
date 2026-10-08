import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { sessionTimezone } from "@/lib/user-time";
import { buildFinancialContext } from "@/lib/ai/financial-context";
import { FINANCIAL_ASSISTANT_SYSTEM_PROMPT, formatContextToPromptText } from "@/lib/ai/prompts";
import { parseAssistantResponse } from "@/lib/ai/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401, headers: NO_STORE });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400, headers: NO_STORE });
  }

  const { message, refMonth, history, action } = body ?? {};

  if (!refMonth || typeof refMonth !== "string") {
    return NextResponse.json({ error: "Competência ('refMonth') obrigatória." }, { status: 400, headers: NO_STORE });
  }

  const tz = await sessionTimezone(supabase);
  const financialContext = await buildFinancialContext(supabase, refMonth, tz);

  // Ação para fornecer o contexto sanitizado ao motor local (Gemma no aparelho)
  if (action === "context") {
    return NextResponse.json(
      {
        context: financialContext,
        contextText: formatContextToPromptText(financialContext),
        systemPrompt: FINANCIAL_ASSISTANT_SYSTEM_PROMPT,
      },
      { headers: NO_STORE },
    );
  }

  // Execução via Claude API (servidor)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chave da API da Claude não configurada no servidor (ANTHROPIC_API_KEY)." },
      { status: 500, headers: NO_STORE },
    );
  }

  const anthropic = new Anthropic({ apiKey });
  const contextText = formatContextToPromptText(financialContext);

  const messages: Anthropic.MessageParam[] = [];

  // Se houver histórico anterior, inclui as mensagens anteriores
  if (Array.isArray(history) && history.length > 0) {
    for (const h of history.slice(-6)) {
      if (h.role === "user" || h.role === "assistant") {
        messages.push({
          role: h.role,
          content: String(h.content),
        });
      }
    }
  }

  // Mensagem atual combinando a pergunta com o contexto financeiro real
  const userContent =
    messages.length === 0
      ? `${contextText}\n\nSOLICITAÇÃO DO USUÁRIO:\n${message || "Faça um raio-x completo do meu mês e aponte ralos de dinheiro e plano de ação."}`
      : `DADOS ATUALIZADOS DO MÊS:\n${contextText}\n\nPERGUNTA DO USUÁRIO:\n${message}`;

  messages.push({
    role: "user",
    content: userContent,
  });

  try {
    const model = process.env.ANTHROPIC_ANALYSIS_MODEL || "claude-3-5-haiku-20241022";

    const response = await anthropic.messages.create({
      model,
      max_tokens: 2500,
      system: FINANCIAL_ASSISTANT_SYSTEM_PROMPT,
      messages,
    });

    const rawText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = parseAssistantResponse(rawText);

    return NextResponse.json(
      {
        content: parsed.content,
        dossier: parsed.dossier,
      },
      { headers: NO_STORE },
    );
  } catch (err: any) {
    console.error("[ia/analise] Erro ao chamar Claude API:", err);
    return NextResponse.json(
      {
        error:
          err?.status === 401
            ? "Chave da API da Claude inválida."
            : "Falha na comunicação com a IA. Tente novamente em instantes.",
      },
      { status: 502, headers: NO_STORE },
    );
  }
}
