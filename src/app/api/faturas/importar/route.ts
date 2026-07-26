import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractInvoice, InvoiceExtractionError } from "@/lib/anthropic";

// A chamada ao LLM pode levar dezenas de segundos → precisa de teto alto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Fatura é PII; nunca cacheia a resposta e nunca loga o conteúdo. */
const NO_STORE = { "Cache-Control": "no-store" };

/** Limite conservador (body serverless da Vercel Hobby fica ~4,5 MB). */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Quota por usuário. Esta é a única rota com custo marginal por request (uma
 * chamada ao modelo com PDF de até 4 MB); sem teto, uma sessão autenticada em
 * loop gera custo ilimitado. O contador vive no banco porque a função é
 * serverless — não há memória compartilhada entre invocações.
 */
const QUOTA = { perHour: 10, perDay: 30 };

type QuotaVerdict = { ok: true } | { ok: false; message: string; retryAfterSeconds: number };

/** Confere a quota da última hora e das últimas 24 h. */
async function checkQuota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<QuotaVerdict> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: lastHour }, { count: lastDay }] = await Promise.all([
    supabase
      .from("invoice_import_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", hourAgo),
    supabase
      .from("invoice_import_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayAgo),
  ]);

  if ((lastHour ?? 0) >= QUOTA.perHour) {
    return {
      ok: false,
      message: "Você atingiu o limite de importações desta hora. Tente novamente mais tarde.",
      retryAfterSeconds: 60 * 60,
    };
  }
  if ((lastDay ?? 0) >= QUOTA.perDay) {
    return {
      ok: false,
      message: "Você atingiu o limite de importações de hoje. Tente novamente amanhã.",
      retryAfterSeconds: 24 * 60 * 60,
    };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const quota = await checkQuota(supabase, user.id);
  if (!quota.ok) {
    return NextResponse.json(
      { error: quota.message },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(quota.retryAfterSeconds) },
      },
    );
  }

  // 1) Lê e valida o arquivo.
  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json(
      { error: "Não foi possível ler o arquivo enviado." },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: "Envie o PDF da fatura." },
      { status: 400, headers: NO_STORE },
    );
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json(
      { error: "O arquivo precisa ser um PDF." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: "O arquivo está vazio." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "PDF muito grande (máx. 4 MB)." },
      { status: 413, headers: NO_STORE },
    );
  }

  // 2) Categorias do usuário (para alinhar a sugestão da IA). Escopado por RLS.
  const { data: categories } = await supabase.from("categories").select("name").order("name");
  const categoryNames = (categories ?? []).map((c) => c.name);

  // 3) Extrai via IA.
  try {
    const bytes = await file.arrayBuffer();

    // Verifica magic bytes: PDF válido começa com "%PDF" (25 50 44 46).
    const header = new Uint8Array(bytes, 0, 4);
    const isPdfMagic =
      header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
    if (!isPdfMagic) {
      return NextResponse.json(
        { error: "O arquivo não é um PDF válido." },
        { status: 400, headers: NO_STORE },
      );
    }

    // Consome a quota ANTES da chamada paga: uma extração que falha no meio já
    // custou tokens, então também precisa contar.
    await supabase.from("invoice_import_log").insert({ user_id: user.id });

    const pdfBase64 = Buffer.from(bytes).toString("base64");
    const invoice = await extractInvoice(pdfBase64, categoryNames);
    return NextResponse.json(invoice, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof InvoiceExtractionError) {
      return NextResponse.json({ error: err.message }, { status: 422, headers: NO_STORE });
    }
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      // O SDK corta em 50 s para caber no maxDuration = 60 da rota (ver anthropic.ts).
      return NextResponse.json(
        { error: "A leitura demorou demais. Tente uma fatura com menos páginas." },
        { status: 504, headers: NO_STORE },
      );
    }
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
      return NextResponse.json(
        { error: "O serviço de leitura está ocupado. Tente novamente em instantes." },
        { status: 503, headers: NO_STORE },
      );
    }
    // Não logar o PDF/base64 nem o corpo do erro (pode conter PII).
    console.error("[faturas/importar] falha na extração:", err instanceof Error ? err.name : "erro");
    return NextResponse.json(
      { error: "Falha ao ler a fatura. Tente novamente." },
      { status: 500, headers: NO_STORE },
    );
  }
}
