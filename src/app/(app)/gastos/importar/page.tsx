import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth } from "@/lib/date";
import { ImportInvoice } from "@/components/import-invoice";

// A revisão dispara a gravação; a extração é na rota /api/faturas/importar.
export const maxDuration = 60;

export default async function ImportarFaturaPage() {
  const supabase = await createClient();

  const [{ data: cards }, { data: categories }] = await Promise.all([
    supabase.from("cards").select("id, name, last_four").eq("active", true).order("created_at"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  const hasCard = (cards?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/gastos/novo" className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl font-bold">Importar fatura</h1>
      </div>

      {hasCard ? (
        <ImportInvoice
          cards={cards ?? []}
          categories={categories ?? []}
          currentMonth={currentReferenceMonth()}
        />
      ) : (
        <Link
          href="/cartoes/novo"
          className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm dark:border-neutral-700"
        >
          Cadastre um cartão antes de importar uma fatura.
        </Link>
      )}
    </div>
  );
}
