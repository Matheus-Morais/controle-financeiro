import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reforço além do middleware (defense-in-depth).
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col pt-safe-top pb-safe-bottom">
      {children}
    </div>
  );
}
