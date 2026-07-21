"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { Spinner } from "@/components/loader";
import type { AccountType } from "@/types/database";

export type ManagedAccount = {
  id: string;
  name: string;
  type: AccountType;
  color: string | null;
  is_default: boolean;
};

type CreateState =
  | { error?: string; ok?: boolean; account?: { id: string; name: string; type: AccountType; color: string | null } }
  | undefined;
type CreateAction = (prev: CreateState, formData: FormData) => Promise<CreateState>;

const PALETTE = ["#0ea5e9", "#16a34a", "#8b5cf6", "#f97316", "#ec4899", "#14b8a6", "#6366f1", "#64748b"];

/** Rótulos das formas de pagamento. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  wallet: "Carteira",
  cash: "Dinheiro",
  checking: "Conta corrente",
  pix: "PIX",
  other: "Outro",
};

const TYPE_OPTIONS: AccountType[] = ["pix", "checking", "cash", "wallet", "other"];

function nextColor(current: string | null): string {
  const i = current ? PALETTE.indexOf(current) : -1;
  return PALETTE[(i + 1 + PALETTE.length) % PALETTE.length];
}

function AccountRow({
  account,
  onUpdate,
  onDelete,
}: {
  account: ManagedAccount;
  onUpdate: (id: string, patch: { name?: string; type?: AccountType; color?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(account.name);
  const [pending, startTransition] = useTransition();
  const color = account.color ?? "#64748b";

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === account.name) {
      setName(account.name);
      return;
    }
    startTransition(() => onUpdate(account.id, { name: trimmed }));
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => startTransition(() => onUpdate(account.id, { color: nextColor(account.color) }))}
        title="Trocar cor"
        className="h-8 w-8 shrink-0 rounded-full ring-offset-2 active:scale-95 dark:ring-offset-neutral-900"
        style={{ backgroundColor: color }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          className="min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium focus:border-neutral-300 focus:bg-neutral-50 dark:focus:border-neutral-700 dark:focus:bg-neutral-950"
        />
        <select
          value={account.type}
          onChange={(e) =>
            startTransition(() => onUpdate(account.id, { type: e.target.value as AccountType }))
          }
          className="w-fit rounded-lg border border-neutral-200 bg-transparent px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-700"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {pending && <span className="text-xs text-neutral-400">salvando…</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(`Excluir a forma de pagamento "${account.name}"?`)) onDelete(account.id);
        }}
        className="p-1.5 text-neutral-400 hover:text-red-500 disabled:opacity-50"
        aria-label="Excluir conta"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {pending ? <Spinner size={16} /> : <Plus size={16} />} Add
    </button>
  );
}

export function AccountManager({
  accounts,
  createAction,
  updateAction,
  deleteAction,
}: {
  accounts: ManagedAccount[];
  createAction: CreateAction;
  updateAction: (id: string, patch: { name?: string; type?: AccountType; color?: string }) => Promise<void>;
  deleteAction: (id: string) => Promise<{ error?: string }>;
}) {
  const [items, setItems] = useState(accounts);
  const [error, setError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);

  function handleUpdate(id: string, patch: { name?: string; type?: AccountType; color?: string }) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    updateAction(id, patch);
  }

  async function handleDelete(id: string) {
    const prev = items;
    setItems((cur) => cur.filter((a) => a.id !== id));
    const res = await deleteAction(id);
    if (res?.error) {
      setItems(prev); // desfaz a remoção otimista
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {items.map((a) => (
          <AccountRow key={a.id} account={a} onUpdate={handleUpdate} onDelete={handleDelete} />
        ))}
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
            Nenhuma forma de pagamento ainda.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <p className="mb-2 text-sm font-medium">Nova forma de pagamento</p>
        <form
          ref={formRef}
          action={async (formData: FormData) => {
            setError(undefined);
            const result = await createAction(undefined, formData);
            if (result?.error) {
              setError(result.error);
              return;
            }
            if (result?.account) {
              setItems((prev) => [...prev, { ...result.account!, is_default: false }]);
              formRef.current?.reset();
            }
          }}
          className="flex items-center gap-2"
        >
          <input
            name="name"
            required
            placeholder="Ex.: PIX, Conta corrente…"
            className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            name="type"
            defaultValue="pix"
            className="rounded-xl border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <AddButton />
        </form>
      </div>
    </div>
  );
}
