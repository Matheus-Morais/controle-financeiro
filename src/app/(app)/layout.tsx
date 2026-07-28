import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Deduplicado por request: as páginas que também precisam do usuário reusam
  // esta mesma resposta em vez de fazer outra ida ao auth server.
  const user = await getSessionUser();

  // Reforço além do middleware (defense-in-depth).
  if (!user) redirect("/login");

  return (
    <div className="mx-auto min-h-screen max-w-md pt-safe-top">
      <main className="px-4 pb-28 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
