import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { ExpenseForm, type ExpenseDefaults } from "@/components/expense-form";
import { updateExpense } from "../actions";

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

  // Só editamos gastos à vista/parcelados; recorrentes são tratados em
  // /recorrentes. O recorrente volta para o detalhe, que explica isso e dá o
  // atalho para a assinatura — antes esta rota era um 404 mudo para ele.
  if (!tx) notFound();
  if (tx.kind === "recurring") {
    redirect(`/gastos/${id}${mes ? `?mes=${mes}` : ""}`);
  }

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

  // Volta para o detalhe, de onde se chega aqui (e que preserva a competência).
  const backHref = `/gastos/${id}${mes ? `?mes=${mes}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackLink href={backHref} />
        <h1 className="text-2xl font-bold">Editar gasto</h1>
      </div>

      <ExpenseForm
        action={updateWithId}
        cards={cards ?? []}
        accounts={accounts ?? []}
        categories={categories ?? []}
        today={todayISO(await sessionTimezone(supabase))}
        expense={expense}
      />

      <p className="px-1 text-center text-xs text-neutral-500">
        Para excluir, volte ao detalhe do gasto.
      </p>
    </div>
  );
}
