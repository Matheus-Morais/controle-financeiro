"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { pushSupported, subscribeToPush } from "@/lib/push-client";
import { savePushSubscription, saveReminderPrefs } from "@/app/(app)/config/actions";

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
  const [weeklyEnabled, setWeeklyEnabled] = useState(initialWeeklyEnabled);
  const [weeklyDay, setWeeklyDay] = useState(initialWeeklyDay);
  const [monthlyEnabled, setMonthlyEnabled] = useState(initialMonthlyEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function enablePush() {
    setStatus(null);
    try {
      const sub = await subscribeToPush();
      if (!sub) {
        setStatus("Permissão de notificação negada.");
        return;
      }
      const res = await savePushSubscription({ ...sub, userAgent: navigator.userAgent });
      setStatus(res?.error ? `Erro: ${res.error}` : "Notificações ativadas neste dispositivo ✅");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao ativar notificações.");
    }
  }

  function persistPrefs(next: Partial<{ weeklyEnabled: boolean; weeklyDay: number; monthlyEnabled: boolean }>) {
    const payload = {
      weeklyEnabled: next.weeklyEnabled ?? weeklyEnabled,
      weeklyDay: next.weeklyDay ?? weeklyDay,
      monthlyEnabled: next.monthlyEnabled ?? monthlyEnabled,
    };
    startTransition(async () => {
      await saveReminderPrefs(payload);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <Bell className="text-brand" size={18} />
        <h2 className="font-semibold">Notificações</h2>
      </div>

      <button
        onClick={enablePush}
        disabled={!pushSupported()}
        className="rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Ativar notificações neste dispositivo
      </button>
      {!pushSupported() && (
        <p className="text-xs text-neutral-500">
          Para receber push no iPhone, instale o app na tela inicial (Compartilhar → Adicionar à
          Tela de Início) e abra por lá.
        </p>
      )}
      {status && <p className="text-xs text-neutral-600 dark:text-neutral-300">{status}</p>}

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

      <label className="flex items-center justify-between text-sm">
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
        <div className="flex flex-wrap gap-1.5">
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

      {pending && <p className="text-xs text-neutral-400">Salvando…</p>}
    </section>
  );
}
