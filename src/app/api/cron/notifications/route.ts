import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPush, type PushPayload } from "@/lib/push-server";
import { formatCents } from "@/lib/money";
import {
  materializeRecurringExpenses,
  materializeRecurringIncomes,
} from "@/lib/recurring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Janela (em dias) de antecedência do lembrete de conta a vencer. */
const BILL_REMINDER_WINDOW_DAYS = 3;

/** Retenção do notification_log: só serve para dedupe de curto prazo (RN-47). */
const NOTIFICATION_LOG_RETENTION_DAYS = 90;

type ServiceClient = ReturnType<typeof createServiceClient>;

type ProfileRow = {
  user_id: string;
  timezone: string;
  weekly_reminder_enabled: boolean;
  weekly_reminder_day: number;
  monthly_reminder_enabled: boolean;
};

/** Contadores do tick, para o corpo da resposta (visibilidade no log da Vercel). */
type Tally = { sent: number; failed: number; materialized: number; processed: number };

/**
 * Tick diário (Vercel Cron ~08:00 BRT). Decide, por usuário e no timezone dele:
 *  - Dia 1 do mês  → lembrete para marcar boletos pagos (se há faturas em aberto).
 *  - Diariamente   → lembrete de contas (PIX/boleto/conta) vencendo nos próximos dias.
 *  - Dia da semana configurado → lembrete para atualizar os gastos da semana.
 * Idempotente via notification_log (unique user_id+type+sent_for).
 *
 * A falha de um usuário não aborta os demais; o corpo devolve os contadores e o
 * status vira 500 quando a taxa de erro é anômala, para o monitor acusar (RN-49).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, timezone, weekly_reminder_enabled, weekly_reminder_day, monthly_reminder_enabled");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tally: Tally = { sent: 0, failed: 0, materialized: 0, processed: 0 };
  const now = new Date();

  for (const p of profiles ?? []) {
    tally.processed++;
    try {
      await processUser(supabase, p, now, tally);
    } catch (err) {
      tally.failed++;
      console.error("[cron] falha ao processar usuário:", err instanceof Error ? err.name : "erro");
    }
  }

  await purgeOldNotificationLog(supabase, now);

  // Taxa de erro anômala (metade ou mais dos usuários) vira 500 — foi justamente
  // a ausência de sinal que deixou o cron quebrado passar despercebido.
  const anomalous = tally.failed > 0 && tally.processed > 0 && tally.failed / tally.processed >= 0.5;
  return NextResponse.json({ ok: !anomalous, ...tally }, { status: anomalous ? 500 : 200 });
}

/** Materializa recorrentes e envia os lembretes devidos de um usuário. */
async function processUser(supabase: ServiceClient, p: ProfileRow, now: Date, tally: Tally) {
  const { day, weekday, isoDate, monthStart } = localCalendar(now, p.timezone);

  // ── Virada de mês (dia 1): materializa recorrentes ────────────────────
  if (day === 1) {
    tally.materialized += await materializeRecurringExpenses(supabase, p.user_id, monthStart);
    tally.materialized += await materializeRecurringIncomes(supabase, p.user_id, monthStart);
  }

  // ── Lembrete mensal (dia 1) ────────────────────────────────────────────
  if (p.monthly_reminder_enabled && day === 1) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", p.user_id)
      .eq("status", "open");

    if ((count ?? 0) > 0) {
      const claimed = await claim(supabase, p.user_id, "monthly", monthStart);
      if (claimed === "failed") tally.failed++;
      if (claimed === "claimed") {
        tally.sent += await pushToUser(supabase, p.user_id, {
          title: "Boletos do mês 💳",
          body: "Confira suas faturas e marque os boletos pagos para não esquecer.",
          url: "/cartoes",
          tag: `monthly-${monthStart}`,
        });
      }
    }
  }

  // ── Lembrete de contas a vencer (PIX/boleto/conta, fora do cartão) ──────
  if (p.monthly_reminder_enabled) {
    const windowEnd = addDaysISO(isoDate, BILL_REMINDER_WINDOW_DAYS - 1);
    const { data: bills } = await supabase
      .from("installments")
      .select("amount_cents")
      .eq("user_id", p.user_id)
      .eq("status", "open")
      .not("account_id", "is", null)
      .is("deleted_at", null)
      .gte("due_date", isoDate)
      .lte("due_date", windowEnd);

    if (bills?.length) {
      const claimed = await claim(supabase, p.user_id, "bills", isoDate);
      if (claimed === "failed") tally.failed++;
      if (claimed === "claimed") {
        const total = bills.reduce((s, b) => s + b.amount_cents, 0);
        const n = bills.length;
        tally.sent += await pushToUser(supabase, p.user_id, {
          title: "Contas a vencer 🧾",
          body: `${n} conta${n > 1 ? "s" : ""} de ${formatCents(total)} vencendo nos próximos dias. Toque para conferir.`,
          url: "/contas",
          tag: `bills-${isoDate}`,
        });
      }
    }
  }

  // ── Lembrete semanal ───────────────────────────────────────────────────
  if (p.weekly_reminder_enabled && weekday === p.weekly_reminder_day) {
    const claimed = await claim(supabase, p.user_id, "weekly", isoDate);
    if (claimed === "failed") tally.failed++;
    if (claimed === "claimed") {
      tally.sent += await pushToUser(supabase, p.user_id, {
        title: "Atualize seus gastos 📝",
        body: "Lance os gastos da semana enquanto estão frescos na memória.",
        url: "/gastos/novo",
        tag: `weekly-${isoDate}`,
      });
    }
  }
}

/** Componentes de calendário (data e dia da semana) no timezone do usuário. */
function localCalendar(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // Dia da semana da data-calendário (independe de TZ uma vez fixada a data).
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year,
    month,
    day,
    weekday,
    isoDate: `${year}-${pad(month)}-${pad(day)}`,
    monthStart: `${year}-${pad(month)}-01`,
  };
}

/** Soma `days` dias a uma data ISO `YYYY-MM-DD`, retornando ISO. */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Reivindica o envio do dia (dedupe idempotente).
 *
 * Distingue os três desfechos: `claimed` (é nosso, pode enviar), `duplicate`
 * (já enviado — unique_violation 23505) e `failed` (erro de infra: timeout,
 * queda de conexão, permissão). Tratar tudo como duplicata descartaria o
 * lembrete do dia em silêncio, e como o cron roda 1×/dia ele se perderia.
 */
async function claim(
  supabase: ServiceClient,
  userId: string,
  type: "monthly" | "weekly" | "bills",
  sentFor: string,
): Promise<"claimed" | "duplicate" | "failed"> {
  const { error } = await supabase
    .from("notification_log")
    .insert({ user_id: userId, type, sent_for: sentFor });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  console.error("[cron] falha ao reivindicar notificação:", { type, code: error.code });
  return "failed";
}

/** Apaga registros de dedupe antigos — o log não precisa crescer para sempre. */
async function purgeOldNotificationLog(supabase: ServiceClient, now: Date) {
  const cutoff = addDaysISO(now.toISOString().slice(0, 10), -NOTIFICATION_LOG_RETENTION_DAYS);
  const { error } = await supabase.from("notification_log").delete().lt("sent_for", cutoff);
  if (error) console.error("[cron] falha ao limpar notification_log:", error.code);
}

/** Envia o payload para todas as subscriptions do usuário; limpa as expiradas. */
async function pushToUser(
  supabase: ServiceClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  let ok = 0;
  for (const s of subs ?? []) {
    const res = await sendPush(s, payload);
    if (res.ok) ok++;
    if (res.gone) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return ok;
}
