import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { RecurringForm } from "@/components/recurring-form";
import { createRecurring } from "../actions";

export default async function NovaRecorrentePage() {
  const supabase = await createClient();
  const [{ data: cards }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("cards").select("id, name").eq("active", true).order("created_at"),
    supabase.from("accounts").select("id, name").order("created_at"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  const hasSource = (cards?.length ?? 0) + (accounts?.length ?? 0) > 0;
  const currentMonth = todayISO(await sessionTimezone(supabase)).slice(0, 7); // YYYY-MM

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackLink href="/recorrentes" label="Voltar para as recorrentes" />
        <h1 className="text-2xl font-bold">Nova recorrente</h1>
      </div>

      {hasSource ? (
        <RecurringForm
          action={createRecurring}
          cards={cards ?? []}
          accounts={accounts ?? []}
          categories={categories ?? []}
          currentMonth={currentMonth}
        />
      ) : (
        <Link
          href="/cartoes/novo"
          className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm dark:border-neutral-700"
        >
          Cadastre um cartão ou carteira antes de criar assinaturas.
        </Link>
      )}
    </div>
  );
}
