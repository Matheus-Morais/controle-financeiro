import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { sessionTimezone } from "@/lib/user-time";
import { buildFinancialContext } from "@/lib/ai/financial-context";
import { buildChatMessages, FINANCIAL_ASSISTANT_SYSTEM_PROMPT, formatContextToPromptText } from "@/lib/ai/prompts";
import { parseAssistantResponse } from "@/lib/ai/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

const CANDIDATE_MODELS = [
  process.env.ANTHROPIC_ANALYSIS_MODEL,
  "claude-haiku-4-5-20251001",
  "claude-haiku-5-5",
].filter((m): m is string => Boolean(m && typeof m === "string"));

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
  const messages = buildChatMessages(history, message ?? "", contextText);

  let response: Anthropic.Message | null = null;
  let lastError: any = null;

  for (const modelToTry of CANDIDATE_MODELS) {
    try {
      response = await anthropic.messages.create({
        model: modelToTry,
        max_tokens: 4000,
        system: FINANCIAL_ASSISTANT_SYSTEM_PROMPT,
        messages,
      });
      break;
    } catch (err: any) {
      lastError = err;
      if (err?.status === 404 || err?.error?.type === "not_found_error") {
        console.warn(`[ia/analise] Modelo '${modelToTry}' não encontrado (404). Tentando próximo modelo...`);
        continue;
      }
      break;
    }
  }

  if (!response) {
    console.error("[ia/analise] Erro ao chamar Claude API:", lastError);
    return NextResponse.json(
      {
        error:
          lastError?.status === 401
            ? "Chave da API da Claude inválida."
            : lastError?.status === 429
            ? "Limite de requisições temporariamente atingido. Tente novamente em instantes."
            : lastError?.status === 404
            ? "Modelo de IA configurado não foi encontrado."
            : "Falha na comunicação com a IA. Tente novamente em instantes.",
      },
      { status: lastError?.status === 401 ? 401 : 502, headers: NO_STORE },
    );
  }

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
}
