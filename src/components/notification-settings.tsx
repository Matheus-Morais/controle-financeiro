"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import {
  getExistingSubscription,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";
import {
  removePushSubscription,
  savePushSubscription,
  saveReminderPrefs,
  sendTestPush,
} from "@/app/(app)/config/actions";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function NotificationSettings({
  initialWeeklyDay,
  initialWeeklyEnabled,
  initialMonthlyEnabled,
}: {
  initialWeeklyDay: number;
  initialWeeklyEnabled: boolean;
  initialMonthlyEnabled: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [weeklyEnabled, setWeeklyEnabled] = useState(initialWeeklyEnabled);
  const [weeklyDay, setWeeklyDay] = useState(initialWeeklyDay);
  const [monthlyEnabled, setMonthlyEnabled] = useState(initialMonthlyEnabled);
  const [pendingPrefs, startPrefs] = useTransition();

  useEffect(() => {
    setMounted(true);
    const ok = pushSupported();
    setSupported(ok);
    if (ok) getExistingSubscription().then((s) => setSubscribed(!!s));
  }, []);

  async function enablePush() {
    setBusy(true);
    setStatus(null);
    try {
      const sub = await subscribeToPush();
      if (!sub) {
        setStatus("Permissão negada. Verifique as permissões do navegador.");
        return;
      }
      const res = await savePushSubscription({ ...sub, userAgent: navigator.userAgent });
      if (res?.error) setStatus(`Erro: ${res.error}`);
      else {
        setSubscribed(true);
        setStatus("Notificações ativadas neste dispositivo ✅");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao ativar.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    setStatus(null);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await removePushSubscription(endpoint);
      setSubscribed(false);
      setStatus("Notificações desativadas neste dispositivo.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao desativar.");
    } finally {
      setBusy(false);
    }
  }

  async function testPush() {
    setBusy(true);
    setStatus(null);
    const res = await sendTestPush();
    setStatus(res.error ? `Erro: ${res.error}` : `Notificação enviada para ${res.sent} dispositivo(s).`);
    setBusy(false);
  }

  function persistPrefs(next: Partial<{ weeklyEnabled: boolean; weeklyDay: number; monthlyEnabled: boolean }>) {
    startPrefs(async () => {
      await saveReminderPrefs({
        weeklyEnabled: next.weeklyEnabled ?? weeklyEnabled,
        weeklyDay: next.weeklyDay ?? weeklyDay,
        monthlyEnabled: next.monthlyEnabled ?? monthlyEnabled,
      });
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <Bell className="text-brand" size={18} />
        <h2 className="font-semibold">Notificações</h2>
      </div>

      {/* Estado só é decidido após montar (evita mismatch de hidratação) */}
      {mounted && !supported && (
        <p className="text-xs text-neutral-500">
          Este dispositivo/navegador não suporta push. No iPhone, instale o app na tela inicial
          (Compartilhar → Adicionar à Tela de Início) e abra por lá.
        </p>
      )}

      {mounted && supported && (
        <div className="flex flex-col gap-2">
          {!subscribed ? (
            <button
              onClick={enablePush}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Bell size={16} /> Ativar notificações neste dispositivo
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={testPush}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Send size={16} /> Enviar teste
              </button>
              <button
                onClick={disablePush}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
              >
                <BellOff size={16} /> Desativar
              </button>
            </div>
          )}
        </div>
      )}

      {status && <p className="text-xs text-neutral-600 dark:text-neutral-300">{status}</p>}

      <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <label className="flex items-center justify-between text-sm">
          Lembrar de marcar boletos (início do mês)
          <input
            type="checkbox"
            checked={monthlyEnabled}
            onChange={(e) => {
              setMonthlyEnabled(e.target.checked);
              persistPrefs({ monthlyEnabled: e.target.checked });
            }}
          />
        </label>

        <label className="mt-3 flex items-center justify-between text-sm">
          Lembrete semanal de gastos
          <input
            type="checkbox"
            checked={weeklyEnabled}
            onChange={(e) => {
              setWeeklyEnabled(e.target.checked);
              persistPrefs({ weeklyEnabled: e.target.checked });
            }}
          />
        </label>

        {weeklyEnabled && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button
                key={d}
                onClick={() => {
                  setWeeklyDay(i);
                  persistPrefs({ weeklyDay: i });
                }}
                className={
                  i === weeklyDay
                    ? "rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
                }
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {pendingPrefs && <p className="mt-2 text-xs text-neutral-400">Salvando…</p>}
      </div>
    </section>
  );
}
