import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatMonthLabel } from "@/lib/date";
import { spendingByCategory } from "@/lib/reports";
import { formatCents } from "@/lib/money";
import { BudgetRow } from "@/components/budget-row";
import { AddCategoryForm } from "@/components/add-category-form";
import { DeleteButton } from "@/components/delete-button";
import { createCategory, deleteCategory } from "./actions";

export default async function OrcamentoPage() {
  const supabase = await createClient();
  const refMonth = currentReferenceMonth();

  const [{ data: categories }, { data: budgets }, spending] = await Promise.all([
    supabase.from("categories").select("id, name, color").order("name"),
    supabase.from("budgets").select("category_id, limit_cents").is("reference_month", null),
    spendingByCategory(supabase, refMonth),
  ]);

  const limitByCat = new Map((budgets ?? []).map((b) => [b.category_id, b.limit_cents]));
  const totalBudget = (budgets ?? []).reduce((s, b) => s + b.limit_cents, 0);
  const totalSpentInBudgets = (categories ?? []).reduce(
    (s, c) => s + (limitByCat.get(c.id) ? spending.get(c.id) ?? 0 : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Orçamento</h1>
        <p className="text-sm text-neutral-500">{formatMonthLabel(refMonth)}</p>
      </div>

      {totalBudget > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <p className="text-xs text-neutral-500">Gasto nas categorias com meta</p>
          <p className="text-2xl font-bold">
            {formatCents(totalSpentInBudgets)}{" "}
            <span className="text-sm font-normal text-neutral-400">
              de {formatCents(totalBudget)}
            </span>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {(categories ?? []).map((c) => (
          <div key={c.id} className="flex items-center gap-1">
            <div className="flex-1">
              <BudgetRow
                categoryId={c.id}
                name={c.name}
                color={c.color ?? "#94a3b8"}
                spentCents={spending.get(c.id) ?? 0}
                initialLimitCents={limitByCat.get(c.id) ?? 0}
              />
            </div>
            <DeleteButton
              onDelete={deleteCategory.bind(null, c.id)}
              confirmText={`Excluir a categoria "${c.name}"? Os gastos ficarão sem categoria.`}
            />
          </div>
        ))}
      </div>

      {spending.get("none") ? (
        <p className="text-center text-xs text-neutral-400">
          Sem categoria neste mês: {formatCents(spending.get("none") ?? 0)}
        </p>
      ) : null}

      <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <p className="mb-2 text-sm font-medium">Nova categoria</p>
        <AddCategoryForm action={createCategory} />
      </div>
    </div>
  );
}
