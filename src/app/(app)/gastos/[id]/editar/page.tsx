import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";
import { ExpenseForm, type ExpenseDefaults } from "@/components/expense-form";
import { DeleteExpenseButton } from "@/components/delete-expense-button";
import { deleteExpense, updateExpense } from "../actions";

export default async function EditarGastoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes } = await searchParams;
  const supabase = await createClient();

  const [{ data: tx }, { data: cards }, { data: accounts }, { data: categories }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id, card_id, account_id, category_id, description, kind, total_amount_cents, purchase_date, installments_count",
        )
        .eq("id", id)
        .single(),
      supabase.from("cards").select("id, name").eq("active", true).order("created_at"),
      supabase.from("accounts").select("id, name").order("created_at"),
      supabase.from("categories").select("id, name").order("name"),
    ]);

  // Só editamos gastos à vista/parcelados; recorrentes são tratados em /recorrentes.
  if (!tx || tx.kind === "recurring") notFound();

  const source = tx.card_id ? `card:${tx.card_id}` : `account:${tx.account_id}`;
  const expense: ExpenseDefaults = {
    description: tx.description,
    amountCents: tx.total_amount_cents,
    source,
    kind: tx.kind as "single" | "installment",
    installmentsCount: tx.installments_count,
    categoryId: tx.category_id,
    purchaseDate: tx.purchase_date,
  };

  const updateWithId = updateExpense.bind(null, id, mes);
  const deleteWithId = deleteExpense.bind(null, id, mes);

  // Voltar para o cartão que o usuário analisa (com o mês), ou home se for carteira.
  const backHref = tx.card_id ? `/cartoes/${tx.card_id}${mes ? `?mes=${mes}` : ""}` : "/";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href={backHref} className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl font-bold">Editar gasto</h1>
      </div>

      <ExpenseForm
        action={updateWithId}
        cards={cards ?? []}
        accounts={accounts ?? []}
        categories={categories ?? []}
        today={todayISO()}
        expense={expense}
      />

      <DeleteExpenseButton action={deleteWithId} />
    </div>
  );
}
