import Link from "next/link";
import { FileUp } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
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
  const today = todayISO(await sessionTimezone(supabase));

  return (
    <div className="flex flex-col gap-4">
      {/* Importar fatura é caminho ALTERNATIVO para o mesmo fim: virou um chip no
          cabeçalho em vez do banner de largura total, que competia em peso com o
          formulário logo abaixo. */}
      <div className="flex items-center gap-2">
        <BackLink href="/" label="Voltar para o início" />
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">Adicionar gasto</h1>
        {(cards?.length ?? 0) > 0 && (
          <Link
            href="/gastos/importar"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition active:scale-95"
          >
            <FileUp size={14} /> Importar PDF
          </Link>
        )}
      </div>

      {hasSource ? (
        <ExpenseForm
          action={createExpense}
          cards={cards ?? []}
          accounts={accounts ?? []}
          categories={categories ?? []}
          today={today}
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
