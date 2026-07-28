"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarDays, CreditCard, Tag } from "lucide-react";
import { Select } from "@/components/select";
import { categoryOptions, sourceOptions, type Option } from "@/components/form-options";
import { SubmitButton } from "@/components/submit-button";
import { formatCents, parseBRLToCents } from "@/lib/money";

type ActionState = { error?: string } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

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

const CARD = "flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200/70 dark:bg-neutral-900 dark:ring-white/5";
const FIELD_LABEL = "flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400";
const INPUT = "rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900";

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
  const [count, setCount] = useState(
    expense && expense.kind === "installment" ? expense.installmentsCount : 2,
  );

  const cents = useMemo(() => parseBRLToCents(amount) ?? 0, [amount]);

  const defaultSource =
    expense?.source ??
    (cards[0] ? `card:${cards[0].id}` : accounts[0] ? `account:${accounts[0].id}` : "");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Valor em destaque: é o campo que o usuário vem preencher, e antes tinha
          o mesmo peso visual da descrição. */}
      <div className="flex flex-col items-center gap-1 rounded-2xl bg-white px-4 py-5 shadow-sm ring-1 ring-neutral-200/70 dark:bg-neutral-900 dark:ring-white/5">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Valor total
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-medium text-neutral-400">R$</span>
          {/* `size` em caracteres faz o campo acompanhar o que foi digitado, para
              o "R$" e o número ficarem sempre juntos e o bloco centralizado —
              com largura fixa o placeholder curto deixava um vão no meio. */}
          <input
            inputMode="decimal"
            required
            size={Math.max(4, amount.length)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            aria-label="Valor total"
            className="w-auto border-0 bg-transparent p-0 text-left text-4xl font-bold tabular-nums outline-none placeholder:text-neutral-300 focus:ring-0 dark:placeholder:text-neutral-700"
          />
        </div>
        <input type="hidden" name="amount_cents" value={cents} />
      </div>

      {/* O gasto */}
      <div className={CARD}>
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Descrição</span>
          <input
            name="description"
            required
            defaultValue={expense?.description}
            placeholder="Ex.: Mercado do mês"
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            <CalendarDays size={13} /> Data da compra
          </span>
          <input
            name="purchase_date"
            type="date"
            required
            defaultValue={expense?.purchaseDate ?? today}
            className={INPUT}
          />
        </label>
      </div>

      {/* Pagamento */}
      <div className={CARD}>
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            <CreditCard size={13} /> Onde
          </span>
          <Select
            name="source"
            defaultValue={defaultSource}
            title="Onde foi o gasto"
            ariaLabel="Onde"
            options={sourceOptions(cards, accounts)}
          />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={FIELD_LABEL}>Forma de pagamento</legend>
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
                <span className="block cursor-pointer rounded-xl border border-neutral-300 py-2.5 text-center text-sm peer-checked:border-brand peer-checked:bg-brand/10 peer-checked:font-semibold peer-checked:text-brand dark:border-neutral-700">
                  {k === "single" ? "À vista" : "Parcelado"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === "installment" && (
          <label className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Número de parcelas</span>
            <input
              name="installments_count"
              type="number"
              min={2}
              max={72}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className={INPUT}
            />
            {/* O valor da parcela já estava calculado e nunca era mostrado — é a
                informação que o usuário quer conferir antes de salvar. */}
            {cents > 0 && count >= 2 && (
              <span className="text-xs text-neutral-500">
                {count}× de{" "}
                <b className="font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
                  {formatCents(Math.round(cents / count))}
                </b>{" "}
                · total {formatCents(cents)}
              </span>
            )}
          </label>
        )}
      </div>

      {/* Classificação */}
      <div className={CARD}>
        <label className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            <Tag size={13} /> Categoria (opcional)
          </span>
          <Select
            name="category_id"
            defaultValue={expense?.categoryId ?? ""}
            title="Categoria"
            ariaLabel="Categoria"
            options={categoryOptions(categories)}
          />
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {/* Botão fixo acima da bottom-nav: antes rolava junto e ficava abaixo da
          dobra assim que o bloco de parcelamento aparecia. */}
      <div className="sticky bottom-24 -mx-4 mt-1 bg-gradient-to-t from-neutral-50 via-neutral-50 to-transparent px-4 pb-1 pt-10 dark:from-neutral-950 dark:via-neutral-950">
        <SubmitButton pendingLabel="Salvando…">
          {expense ? "Salvar alterações" : "Salvar gasto"}
        </SubmitButton>
      </div>
    </form>
  );
}
