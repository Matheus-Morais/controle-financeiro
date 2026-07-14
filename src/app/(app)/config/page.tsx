import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { NotificationSettings } from "@/components/notification-settings";
import { PhasePlaceholder } from "@/components/phase-placeholder";

export default async function ConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, weekly_reminder_day, weekly_reminder_enabled, monthly_reminder_enabled")
    .single();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <p className="text-sm text-neutral-500">Conta</p>
        <p className="font-medium">{profile?.display_name ?? user?.email}</p>
        <p className="text-sm text-neutral-500">{user?.email}</p>
      </section>

      <NotificationSettings
        initialWeeklyDay={profile?.weekly_reminder_day ?? 1}
        initialWeeklyEnabled={profile?.weekly_reminder_enabled ?? true}
        initialMonthlyEnabled={profile?.monthly_reminder_enabled ?? true}
      />

      <PhasePlaceholder title="Exportar dados (CSV)" phase="Fase 4 — Extras" />

      <form action={signOut}>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-3 font-medium text-red-600 dark:border-red-900"
        >
          <LogOut size={18} />
          Sair
        </button>
      </form>
    </div>
  );
}
