"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CreditCard, FileUp, Plus } from "lucide-react";
import { createOnboardingCard } from "@/app/onboarding/actions";
import { CARD_COLORS } from "@/lib/card-colors";

type CardSummary = { id: string; name: string; color: string | null };
type ActionState = { error?: string; card?: CardSummary } | undefined;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center justify-center gap-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      <Plus size={16} /> {pending ? "Adicionando…" : "Adicionar cartão"}
    </button>
  );
}

export function StepCards({
  cards,
  onCardsChange,
  onNext,
  onBack,
}: {
  cards: CardSummary[];
  onCardsChange: (cards: CardSummary[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createOnboardingCard, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.card) {
      onCardsChange([...cards, state.card]);
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-2xl font-bold">Seus cartões de crédito</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Cadastre quantos quiser, um de cada vez. Se preferir, pule e cadastre depois em Cartões.
      </p>

      {cards.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {cards.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? "#94a3b8" }} />
              <span className="flex-1 text-sm font-medium">{c.name}</span>
              <CreditCard size={16} className="text-neutral-400" />
            </div>
          ))}
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900"
      >
        <label className="flex flex-col gap-1 text-sm">
          Nome do cartão
          <input
            name="name"
            required
            placeholder="Ex.: Nubank"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Dia de fechamento
            <input
              name="closing_day"
              type="number"
              min={1}
              max={31}
              required
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Dia de vencimento
            <input
              name="due_day"
              type="number"
              min={1}
              max={31}
              required
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
        </div>

        <fieldset className="flex flex-col gap-2 text-sm">
          Cor
          <div className="flex flex-wrap gap-2.5">
            {CARD_COLORS.map((c, i) => (
              <label key={c.hex} className="cursor-pointer" title={c.name}>
                <input
                  type="radio"
                  name="color"
                  value={c.hex}
                  aria-label={c.name}
                  defaultChecked={i === 0}
                  className="peer sr-only"
                />
                <span
                  className="block h-8 w-8 rounded-full ring-offset-2 ring-offset-white transition peer-checked:ring-2 peer-checked:ring-neutral-900 peer-hover:scale-110 dark:ring-offset-neutral-900 dark:peer-checked:ring-white"
                  style={{ backgroundColor: c.hex }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <SubmitButton />
      </form>

      {cards.length > 0 && (
        <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-brand">
            <FileUp size={16} /> Como importar sua fatura em PDF
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-neutral-600 dark:text-neutral-300">
            <li>Baixe o PDF da fatura no app ou site do seu banco.</li>
            <li>No menu &ldquo;Adicionar&rdquo;, toque em &ldquo;Importar fatura do cartão (PDF)&rdquo;.</li>
            <li>Envie o arquivo — os gastos são extraídos automaticamente para você revisar.</li>
          </ol>
        </div>
      )}

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
          {cards.length > 0 ? "Continuar" : "Pular por agora"}
        </button>
      </div>
    </div>
  );
}
