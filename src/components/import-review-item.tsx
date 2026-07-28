"use client";

import { Pencil } from "lucide-react";
import { formatCents, parseBRLToCents } from "@/lib/money";
import type { ExistingOccurrence, ExtractedTipo } from "@/lib/invoice-import";

export interface Category {
  id: string;
  name: string;
}

/** Um lançamento da fatura como a revisão o manipula (estado da tela). */
export interface EditableItem {
  id: string;
  statementDescription: string; // nome bruto da fatura (imutável, usado na dedupe)
  description: string; // nome amigável (editável, sem o token de parcela)
  valorBrl: string; // editável
  purchaseDate: string; // YYYY-MM-DD, editável
  categoryId: string; // "" ou uuid
  tipo: ExtractedTipo;
  parcela: { atual: number; total: number } | null; // parcela lida da fatura
  importable: boolean;
  include: boolean;
  /** Ocorrência já gravada nesta competência que corresponde a este lançamento. */
  match: ExistingOccurrence | null;
  /** Assinatura JÁ cadastrada à qual o item pertence (importa vinculado a ela). */
  linkedRecurringId: string | null;
  linkedRecurringName: string | null;
  suggestedRecurring: boolean; // IA sinalizou como provável recorrente
  markAsRecurring: boolean; // usuário quer criar como recorrente
}

/** Texto do selo que explica por que o item já existe na competência. */
function matchLabel(match: ExistingOccurrence): string {
  // Excluído conta como lançado (RN-24) — mas o selo precisa dizer isso, senão
  // "já importado" num item que sumiu da fatura parece erro.
  if (match.deleted) return "excluído neste mês";
  if (match.recurringId) return "assinatura já lançada";
  // A cadeia de parcelas já foi materializada num import anterior; a ocorrência
  // encontrada pode estar em outro mês, então não citamos o número da parcela.
  if (match.installmentsCount > 1) return `parcelamento já importado`;
  return "já importado";
}

const shortDate = (iso: string) =>
  iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso;

/**
 * Uma linha da revisão da fatura: modo leitura (compacto) e modo edição
 * (valor, data, categoria e marcação de recorrente). O agrupamento em
 * Novos / Já importados fica com o componente pai.
 */
export function ImportReviewItem({
  item,
  categories,
  isEditing,
  onToggleEdit,
  onChange,
}: {
  item: EditableItem;
  categories: Category[];
  isEditing: boolean;
  onToggleEdit: () => void;
  onChange: (patch: Partial<EditableItem>) => void;
}) {
  const cents = parseBRLToCents(item.valorBrl);
  const invalid = item.include && (cents == null || cents <= 0);
  const catName = categories.find((c) => c.id === item.categoryId)?.name;
  // O botão de recorrente aparece quando a IA sugeriu, quando o usuário já marcou
  // ou quando o item foi casado com uma assinatura existente (aí serve para
  // desvincular, caso o casamento tenha sido um falso positivo).
  const showRecurringToggle =
    item.suggestedRecurring || item.markAsRecurring || !!item.linkedRecurringId;

  function toggleRecurring() {
    if (item.linkedRecurringId) {
      onChange({ linkedRecurringId: null, linkedRecurringName: null, markAsRecurring: false });
      return;
    }
    onChange({ markAsRecurring: !item.markAsRecurring });
  }

  return (
    <li
      className={`rounded-2xl bg-white p-3.5 shadow-sm transition dark:bg-neutral-900 ${
        isEditing
          ? "ring-2 ring-brand/40"
          : invalid
            ? "ring-1 ring-red-300 dark:ring-red-500/40"
            : "ring-1 ring-neutral-200/70 dark:ring-white/5"
      } ${item.include ? "" : "opacity-60"}`}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={item.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="h-5 w-5 shrink-0 rounded accent-brand"
          aria-label={`Incluir ${item.description}`}
        />
        {isEditing ? (
          <input
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800"
            placeholder="Nome do gasto"
          />
        ) : (
          <button
            type="button"
            onClick={onToggleEdit}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{item.description || "Sem nome"}</span>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${invalid ? "text-red-600 dark:text-red-400" : ""}`}
                >
                  {formatCents(cents ?? 0)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                <span
                  className={
                    catName
                      ? "rounded-md bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800"
                      : "italic text-neutral-400"
                  }
                >
                  {catName ?? "Sem categoria"}
                </span>
                {item.parcela && !item.markAsRecurring && !item.linkedRecurringId && (
                  <span className="rounded-md bg-brand/10 px-1.5 py-0.5 font-medium text-brand">
                    Parcela {item.parcela.atual}/{item.parcela.total}
                  </span>
                )}
                {item.linkedRecurringId ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                    ↻ assinatura já cadastrada
                  </span>
                ) : item.markAsRecurring ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                    ✓ Recorrente
                  </span>
                ) : (
                  item.suggestedRecurring && (
                    <span className="rounded-full border border-dashed border-emerald-400/70 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                      ↻ recorrente?
                    </span>
                  )
                )}
                {item.match && (
                  <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-neutral-400 dark:bg-neutral-800">
                    {matchLabel(item.match)}
                  </span>
                )}
                <span>{shortDate(item.purchaseDate)}</span>
              </div>
            </div>
            <Pencil size={15} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
          </button>
        )}
      </div>

      {isEditing && (
        <div className="mt-2.5 flex flex-col gap-2 pl-8">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
              Valor
              <input
                inputMode="decimal"
                value={item.valorBrl}
                onChange={(e) => onChange({ valorBrl: e.target.value })}
                placeholder="0,00"
                className={`rounded-lg border bg-neutral-50 px-2.5 py-2 text-sm dark:bg-neutral-800 ${
                  invalid ? "border-red-400" : "border-neutral-200 dark:border-neutral-700"
                }`}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
              Data
              <input
                type="date"
                value={item.purchaseDate}
                onChange={(e) => onChange({ purchaseDate: e.target.value })}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
          </div>
          <select
            value={item.categoryId}
            onChange={(e) => onChange({ categoryId: e.target.value })}
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between gap-2">
            {showRecurringToggle ? (
              <button
                type="button"
                onClick={toggleRecurring}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  item.markAsRecurring || item.linkedRecurringId
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                    : "border border-dashed border-emerald-400 text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {item.linkedRecurringId
                  ? `✓ ${item.linkedRecurringName ?? "Assinatura"} — desvincular`
                  : item.markAsRecurring
                    ? "✓ Recorrente"
                    : "↻ Marcar recorrente"}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onToggleEdit}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-brand"
            >
              Concluir
            </button>
          </div>
          {item.statementDescription && item.statementDescription !== item.description && (
            <p className="truncate text-[11px] text-neutral-400">{item.statementDescription}</p>
          )}
        </div>
      )}
    </li>
  );
}
