"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { parseBRLToCents } from "@/lib/money";

type ActionState = { error?: string } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface Option {
  id: string;
  name: string;
}

/** Valores para pré-preencher o form ao editar um gasto existente. */
export interface ExpenseDefaults {
  description: string;
  amountCents: number;
  /** Origem no formato "card:<id>" ou "account:<id>". */
  source: string;
  kind: "single" | "installment";
  installmentsCount: number;
  categoryId: string | null;
  purchaseDate: string;
}

/** Formata centavos para o input pt-BR sem símbolo de moeda: 123456 → "1.234,56". */
function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "Salvando…" : editing ? "Salvar alterações" : "Salvar gasto"}
    </button>
  );
}

export function ExpenseForm({
  action,
  cards,
  accounts,
  categories,
  today,
  expense,
}: {
  action: Action;
  cards: Option[];
  accounts: Option[];
  categories: Option[];
  today: string;
  expense?: ExpenseDefaults;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [amount, setAmount] = useState(expense ? centsToInput(expense.amountCents) : "");
  const [kind, setKind] = useState<"single" | "installment">(expense?.kind ?? "single");

  const cents = useMemo(() => parseBRLToCents(amount) ?? 0, [amount]);

  const defaultSource =
    expense?.source ??
    (cards[0] ? `card:${cards[0].id}` : accounts[0] ? `account:${accounts[0].id}` : "");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Descrição
        <input
          name="description"
          required
          defaultValue={expense?.description}
          placeholder="Ex.: Mercado do mês"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Valor total
        <input
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input type="hidden" name="amount_cents" value={cents} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Onde
        <select
          name="source"
          defaultValue={defaultSource}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {cards.length > 0 && (
            <optgroup label="Cartões">
              {cards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {accounts.length > 0 && (
            <optgroup label="Carteira / conta">
              {accounts.map((a) => (
                <option key={a.id} value={`account:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <fieldset className="flex flex-col gap-2 text-sm">
        Forma de pagamento
        <div className="flex gap-2">
          {(["single", "installment"] as const).map((k) => (
            <label key={k} className="flex-1">
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="peer sr-only"
              />
              <span className="block cursor-pointer rounded-xl border border-neutral-300 py-2.5 text-center peer-checked:border-brand peer-checked:bg-brand/10 peer-checked:font-semibold peer-checked:text-brand dark:border-neutral-700">
                {k === "single" ? "À vista" : "Parcelado"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "installment" && (
        <label className="flex flex-col gap-1 text-sm">
          Número de parcelas
          <input
            name="installments_count"
            type="number"
            min={2}
            max={72}
            defaultValue={expense && expense.kind === "installment" ? expense.installmentsCount : 2}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {cents > 0 && (
            <span className="text-xs text-neutral-500">Cada parcela ≈ o total dividido igualmente.</span>
          )}
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Categoria (opcional)
        <select
          name="category_id"
          defaultValue={expense?.categoryId ?? ""}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Data da compra
        <input
          name="purchase_date"
          type="date"
          required
          defaultValue={expense?.purchaseDate ?? today}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton editing={!!expense} />
    </form>
  );
}
