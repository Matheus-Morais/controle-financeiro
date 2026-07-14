import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPush, type PushPayload } from "@/lib/push-server";
import {
  materializeRecurringExpenses,
  materializeRecurringIncomes,
} from "@/lib/recurring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tick diário (Vercel Cron ~08:00 BRT). Decide, por usuário e no timezone dele:
 *  - Dia 1 do mês  → lembrete para marcar boletos pagos (se há faturas em aberto).
 *  - Dia da semana configurado → lembrete para atualizar os gastos da semana.
 * Idempotente via notification_log (unique user_id+type+sent_for).
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

  let sent = 0;
  const now = new Date();

  for (const p of profiles ?? []) {
    const { year, month, day, weekday, isoDate, monthStart } = localCalendar(now, p.timezone);

    // ── Virada de mês (dia 1): materializa recorrentes ──────────────────
    if (day === 1) {
      await materializeRecurringExpenses(supabase, p.user_id, monthStart);
      await materializeRecurringIncomes(supabase, p.user_id, monthStart);
    }

    // ── Lembrete mensal (dia 1) ──────────────────────────────────────────
    if (p.monthly_reminder_enabled && day === 1) {
      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id)
        .eq("status", "open");

      if ((count ?? 0) > 0 && (await claim(supabase, p.user_id, "monthly", monthStart))) {
        sent += await pushToUser(supabase, p.user_id, {
          title: "Boletos do mês 💳",
          body: "Confira suas faturas e marque os boletos pagos para não esquecer.",
          url: "/cartoes",
          tag: `monthly-${monthStart}`,
        });
      }
    }

    // ── Lembrete semanal ─────────────────────────────────────────────────
    if (p.weekly_reminder_enabled && weekday === p.weekly_reminder_day) {
      if (await claim(supabase, p.user_id, "weekly", isoDate)) {
        sent += await pushToUser(supabase, p.user_id, {
          title: "Atualize seus gastos 📝",
          body: "Lance os gastos da semana enquanto estão frescos na memória.",
          url: "/gastos/novo",
          tag: `weekly-${isoDate}`,
        });
      }
    }

    void year;
    void month;
  }

  return NextResponse.json({ ok: true, sent });
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

/** Registra a intenção de envio; retorna false se já foi enviado (dedupe). */
async function claim(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  type: "monthly" | "weekly",
  sentFor: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("notification_log")
    .insert({ user_id: userId, type, sent_for: sentFor });
  return !error; // conflito (unique) → já enviado hoje
}

/** Envia o payload para todas as subscriptions do usuário; limpa as expiradas. */
async function pushToUser(
  supabase: ReturnType<typeof createServiceClient>,
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
