"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Filtros da busca de gastos.
 *
 * É um `<form>` GET de verdade: o estado da busca mora na URL, então o botão
 * voltar funciona, o resultado é compartilhável e a tela continua usável se o
 * JavaScript não carregar. O client component existe só para disparar o envio
 * quando um `<select>` muda — digitar o texto ainda exige confirmar, para não
 * consultar o banco a cada tecla.
 */
export function ExpenseSearchForm({
  term,
  from,
  to,
  categoryId,
  categories,
  months,
}: {
  term: string;
  from: string;
  to: string;
  categoryId: string;
  categories: { id: string; name: string }[];
  months: { value: string; label: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const params = useSearchParams();

  const submit = () => formRef.current?.requestSubmit();
  const hasFilter = term || categoryId || params.has("de") || params.has("ate");

  return (
    <form
      ref={formRef}
      action="/gastos"
      className="grid gap-2 rounded-xl bg-white p-3 shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] md:items-end dark:bg-neutral-900"
    >
      <label className="flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
        <Search size={16} className="shrink-0 text-neutral-400" />
        <span className="sr-only">Buscar lançamento</span>
        <input
          type="search"
          name="q"
          defaultValue={term}
          placeholder="Buscar por descrição"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <Field label="De">
          <select name="de" defaultValue={from} onChange={submit} className={SELECT}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Até">
          <select name="ate" defaultValue={to} onChange={submit} className={SELECT}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Categoria">
        <select name="categoria" defaultValue={categoryId} onChange={submit} className={SELECT}>
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2 md:min-w-36">
        <button
          type="submit"
          className="flex-1 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Buscar
        </button>
        {hasFilter ? (
          <button
            type="button"
            onClick={() => router.push("/gastos")}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
          >
            Limpar
          </button>
        ) : null}
      </div>
    </form>
  );
}

const SELECT =
  "w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm outline-none dark:bg-neutral-800";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
