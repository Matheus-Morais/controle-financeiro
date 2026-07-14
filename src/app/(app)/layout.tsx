import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reforço além do middleware (defense-in-depth).
  if (!user) redirect("/login");

  return (
    <div className="mx-auto min-h-screen max-w-md pt-safe-top">
      <main className="px-4 pb-28 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
