import Link from "next/link";
import { ChevronLeft, ChevronRight, FileUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";
import { ExpenseForm } from "@/components/expense-form";
import { createExpense } from "./actions";

export default async function NovoGastoPage() {
  const supabase = await createClient();

  const [{ data: cards }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("cards").select("id, name").eq("active", true).order("created_at"),
    supabase.from("accounts").select("id, name").order("created_at"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  const hasSource = (cards?.length ?? 0) + (accounts?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl font-bold">Adicionar gasto</h1>
      </div>

      {(cards?.length ?? 0) > 0 && (
        <Link
          href="/gastos/importar"
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <FileUp size={18} className="text-brand" />
          <span className="flex-1">Importar fatura do cartão (PDF)</span>
          <ChevronRight size={18} className="text-neutral-400" />
        </Link>
      )}

      {hasSource ? (
        <ExpenseForm
          action={createExpense}
          cards={cards ?? []}
          accounts={accounts ?? []}
          categories={categories ?? []}
          today={todayISO()}
        />
      ) : (
        <Link
          href="/cartoes/novo"
          className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm dark:border-neutral-700"
        >
          Cadastre um cartão ou carteira antes de lançar gastos.
        </Link>
      )}
    </div>
  );
}
