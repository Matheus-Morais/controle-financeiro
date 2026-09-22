import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { TopNav } from "@/components/top-nav";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Deduplicado por request: as páginas que também precisam do usuário reusam
  // esta mesma resposta em vez de fazer outra ida ao auth server.
  const user = await getSessionUser();

  // Reforço além do middleware (defense-in-depth).
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-neutral-50 pt-safe-top dark:bg-neutral-950">
      <TopNav />
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4 md:max-w-7xl md:px-6 md:pb-10 md:pt-6 lg:px-8">
        {children}
      </main>
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
