"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { AddCategoryForm } from "@/components/add-category-form";

type FormActionState = { error?: string; ok?: boolean } | undefined;
type CreateActionState = { error?: string; ok?: boolean; category?: ManagedCategory } | undefined;
type CreateAction = (prev: CreateActionState, formData: FormData) => Promise<CreateActionState>;

export type ManagedCategory = { id: string; name: string; color: string | null };

const PALETTE = ["#16a34a", "#0ea5e9", "#8b5cf6", "#ef4444", "#f97316", "#ec4899", "#14b8a6", "#6366f1"];

function nextColor(current: string | null): string {
  const i = current ? PALETTE.indexOf(current) : -1;
  return PALETTE[(i + 1 + PALETTE.length) % PALETTE.length];
}

function CategoryRow({
  category,
  onUpdate,
  onDelete,
}: {
  category: ManagedCategory;
  onUpdate: (id: string, patch: { name?: string; color?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(category.name);
  const [pending, startTransition] = useTransition();
  const color = category.color ?? "#94a3b8";

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      setName(category.name);
      return;
    }
    startTransition(() => onUpdate(category.id, { name: trimmed }));
  }

  function cycleColor() {
    startTransition(() => onUpdate(category.id, { color: nextColor(category.color) }));
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900">
      <button
        type="button"
        onClick={cycleColor}
        title="Trocar cor"
        className="h-8 w-8 shrink-0 rounded-full ring-offset-2 active:scale-95 dark:ring-offset-neutral-900"
        style={{ backgroundColor: color }}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium focus:border-neutral-300 focus:bg-neutral-50 dark:focus:border-neutral-700 dark:focus:bg-neutral-950"
      />
      {pending && <span className="text-xs text-neutral-400">salvando…</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(`Excluir a categoria "${category.name}"? Os gastos ficarão sem categoria.`)) {
            onDelete(category.id);
          }
        }}
        className="p-1.5 text-neutral-400 hover:text-red-500 disabled:opacity-50"
        aria-label="Excluir categoria"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function CategoryManager({
  categories,
  onCategoriesChange,
  createAction,
  updateAction,
  deleteAction,
}: {
  categories: ManagedCategory[];
  onCategoriesChange?: (categories: ManagedCategory[]) => void;
  createAction: CreateAction;
  updateAction: (id: string, patch: { name?: string; color?: string }) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const [items, setItems] = useState(categories);

  function update(next: ManagedCategory[]) {
    setItems(next);
    onCategoriesChange?.(next);
  }

  function handleUpdate(id: string, patch: { name?: string; color?: string }) {
    update(items.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    updateAction(id, patch);
  }

  function handleDelete(id: string) {
    update(items.filter((c) => c.id !== id));
    deleteAction(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {items.map((c) => (
          <CategoryRow key={c.id} category={c} onUpdate={handleUpdate} onDelete={handleDelete} />
        ))}
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
            Nenhuma categoria ainda.
          </p>
        )}
      </div>

      <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <p className="mb-2 text-sm font-medium">Nova categoria</p>
        <AddCategoryForm
          action={async (prev: FormActionState, formData: FormData): Promise<FormActionState> => {
            const result = await createAction(prev, formData);
            if (result?.category) update([...items, result.category]);
            return { error: result?.error, ok: result?.ok };
          }}
        />
      </div>
    </div>
  );
}
