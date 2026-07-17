"use client";

import { CategoryManager, type ManagedCategory } from "@/components/category-manager";
import { createCategory, deleteCategory, updateCategory } from "@/app/(app)/orcamento/actions";

export function StepCategories({
  categories,
  onCategoriesChange,
  onNext,
  onBack,
}: {
  categories: ManagedCategory[];
  onCategoriesChange: (categories: ManagedCategory[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-2xl font-bold">Suas categorias de gastos</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Já criamos algumas para você começar. Renomeie, toque na bolinha para trocar a cor, remova
        ou adicione as suas.
      </p>

      <div className="mt-4 flex-1">
        <CategoryManager
          categories={categories}
          onCategoriesChange={onCategoriesChange}
          createAction={createCategory}
          updateAction={updateCategory}
          deleteAction={deleteCategory}
        />
      </div>

      <div className="mt-auto flex items-center gap-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium dark:border-neutral-700"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98]"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
