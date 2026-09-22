/**
 * Preparo da tela de revisão da fatura importada.
 *
 * É a parte da importação que não depende de React: o formato do item
 * editável, a tradução da saída da IA para esse formato, o palpite de cartão e
 * os rótulos dos grupos. Saiu de `import-invoice.tsx` porque o componente
 * passava de 600 linhas e essas regras — quais campos a IA preenche, qual vira
 * editável, quando um cartão pode ser pré-selecionado — são testáveis sozinhas,
 * sem montar a tela.
 *
 * Continua valendo a fronteira da RN-37: nada aqui grava. A IA sugere, o código
 * decide o que é importável e o usuário confirma na revisão.
 */

import { parseBRLToCents } from "./money";
import {
  isImportable,
  matchCategoryByName,
  normalizeText,
  stripInstallmentSuffix,
  type ExistingOccurrence,
  type ExtractedInvoice,
  type ExtractedTipo,
  type ReviewGroupKey,
} from "./invoice-import";

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

export interface Card {
  id: string;
  name: string;
  last_four: string | null;
  color: string | null;
  closing_day: number;
  due_day: number;
}
export interface Category {
  id: string;
  name: string;
  color?: string | null;
}

export const TIPO_LABEL: Record<ExtractedTipo, string> = {
  compra: "Compra",
  credito: "Crédito/estorno",
  encargo: "Encargo",
  pagamento: "Pagamento",
  outro: "Outro",
};

/** Subgrupos de cada seção, na ordem em que aparecem na tela. */
export const NEW_GROUPS: { key: ReviewGroupKey; label: string }[] = [
  { key: "new-installment", label: "Parcelados" },
  { key: "new-single", label: "À vista" },
  { key: "new-recurring", label: "Recorrentes" },
];
// "À vista" só existe aqui quando o mesmo PDF é subido duas vezes; fica por
// último e, como todo subgrupo, só é renderizado quando tem item.
export const EXISTING_GROUPS: { key: ReviewGroupKey; label: string }[] = [
  { key: "existing-installment", label: "Parcelados" },
  { key: "existing-recurring", label: "Recorrentes" },
  { key: "existing-single", label: "À vista" },
];

export const sumItems = (list: EditableItem[]) =>
  list.reduce((s, it) => s + (parseBRLToCents(it.valorBrl) ?? 0), 0);

export function toEditableItems(inv: ExtractedInvoice, categories: Category[]): EditableItem[] {
  return inv.itens.map((it, i) => ({
    id: `it-${i}`,
    statementDescription: it.descricao,
    // Nome amigável criado pela IA vira o título editável; cai no bruto se a IA
    // não conseguiu limpar. O token de parcela é removido de qualquer forma.
    description: stripInstallmentSuffix(it.nome_amigavel?.trim() || it.descricao, it.parcela),
    valorBrl: it.valor_brl,
    purchaseDate: it.data,
    categoryId: matchCategoryByName(it.categoria_sugerida, categories) ?? "",
    tipo: it.tipo,
    parcela: it.parcela,
    importable: isImportable(it.tipo),
    include: isImportable(it.tipo),
    match: null,
    linkedRecurringId: null,
    linkedRecurringName: null,
    suggestedRecurring: it.sugerido_recorrente,
    markAsRecurring: false,
  }));
}

/**
 * Palpite de cartão por emissor/bandeira, usado só quando o PDF não traz os 4
 * dígitos. Casa quando o nome de um cartão cadastrado aparece no texto de
 * emissor/bandeira da fatura (ou vice-versa) e é o ÚNICO candidato — ambíguo não
 * conta. É apenas pré-seleção: nunca marca o cartão como confiável (isso é
 * exclusivo do match por dígitos), então o usuário sempre confirma no modal.
 */
export function matchCardByIssuer(inv: ExtractedInvoice, cards: Card[]): Card | undefined {
  const hay = normalizeText(`${inv.emissor ?? ""} ${inv.bandeira ?? ""}`).trim();
  if (hay.length < 3) return undefined;
  const matches = cards.filter((c) => {
    const name = normalizeText(c.name);
    return name.length >= 3 && (hay.includes(name) || name.includes(hay));
  });
  return matches.length === 1 ? matches[0] : undefined;
}
