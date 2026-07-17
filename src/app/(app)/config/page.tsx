import { Download, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { NotificationSettings } from "@/components/notification-settings";
import { InstallPrompt } from "@/components/install-prompt";
import { TimezoneSelect } from "@/components/timezone-select";
import { AccountDangerZone } from "@/components/danger-zone";

export default async function ConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone, weekly_reminder_day, weekly_reminder_enabled, monthly_reminder_enabled")
    .single();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <p className="text-sm text-neutral-500">Conta</p>
        <p className="font-medium">{profile?.display_name ?? user?.email}</p>
        <p className="text-sm text-neutral-500">{user?.email}</p>
      </section>

      <InstallPrompt />

      <NotificationSettings
        initialWeeklyDay={profile?.weekly_reminder_day ?? 1}
        initialWeeklyEnabled={profile?.weekly_reminder_enabled ?? true}
        initialMonthlyEnabled={profile?.monthly_reminder_enabled ?? true}
      />

      <TimezoneSelect initial={profile?.timezone ?? "America/Sao_Paulo"} />

      <a
        href="/api/export"
        className="flex items-center justify-center gap-2 rounded-2xl bg-white p-4 text-sm font-medium shadow-sm dark:bg-neutral-900"
        download
      >
        <Download size={18} className="text-brand" />
        Exportar meus dados (CSV)
      </a>

      <form action={signOut}>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-3 font-medium text-red-600 dark:border-red-900"
        >
          <LogOut size={18} />
          Sair
        </button>
      </form>

      <AccountDangerZone />
    </div>
  );
}
