"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push-server";

/** Persiste a subscription de Web Push do usuário atual. */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );

  if (error) return { error: error.message };
  return { ok: true };
}

/** Atualiza as preferências de lembrete do usuário. */
export async function saveReminderPrefs(prefs: {
  weeklyEnabled: boolean;
  weeklyDay: number;
  monthlyEnabled: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase
    .from("profiles")
    .update({
      weekly_reminder_enabled: prefs.weeklyEnabled,
      weekly_reminder_day: prefs.weeklyDay,
      monthly_reminder_enabled: prefs.monthlyEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/config");
  return { ok: true };
}

/** Atualiza o fuso horário do usuário (usado nos lembretes). */
export async function saveTimezone(timezone: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  const { error } = await supabase
    .from("profiles")
    .update({ timezone, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/config");
  return { ok: true };
}

/** Remove a subscription de push do dispositivo atual (ao desativar). */
export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  return { ok: true };
}

/** Envia uma notificação de teste para todos os dispositivos do usuário. */
export async function sendTestPush(): Promise<{ error?: string; sent?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (!subs?.length) return { error: "Nenhum dispositivo ativado. Ative as notificações primeiro." };

  let sent = 0;
  for (const s of subs) {
    const res = await sendPush(s, {
      title: "Notificação de teste 🔔",
      body: "As notificações estão funcionando! Você receberá lembretes de boletos e gastos.",
      url: "/config",
      tag: "test",
    });
    if (res.ok) sent++;
    if (res.gone) await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  }
  return { sent };
}
