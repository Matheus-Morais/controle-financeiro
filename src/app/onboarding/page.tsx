import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: categories }] = await Promise.all([
    supabase.from("profiles").select("display_name, timezone").single(),
    supabase.from("categories").select("id, name, color").order("name"),
  ]);

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "";

  return (
    <OnboardingWizard
      displayName={displayName}
      initialCategories={categories ?? []}
      todayISODate={todayISO(profile?.timezone ?? undefined)}
    />
  );
}
