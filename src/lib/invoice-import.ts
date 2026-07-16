/**
 * Importação de fatura de cartão (PDF → IA → gastos).
 *
 * Este módulo é a "costura pura" da feature: schemas de validação (Zod) e as
 * funções determinísticas de mapeamento (categoria, dedupe, montagem das linhas
 * de banco). A parte de I/O (chamada à Claude API, inserts no Supabase) vive
 * fora daqui, para que toda a lógica de valor/competência/categoria seja testável.
 *
 * Convenções do projeto respeitadas:
 * - Dinheiro sempre em centavos inteiros; conversão de string só via money.ts.
 * - Competência é sempre o 1º dia do mês (`YYYY-MM-01`).
 */

import { z } from "zod";
import { invoiceRefForMonth, ymd, type CardCycle } from "./invoice";

// ── Schema da saída da IA (structured outputs) ──────────────────────────────

export const extractedTipoSchema = z.enum([
  "compra",
  "credito",
  "encargo",
  "pagamento",
  "outro",
]);
export type ExtractedTipo = z.infer<typeof extractedTipoSchema>;

/**
 * Um lançamento como a IA extrai da fatura. Tudo é `nullable` (não `optional`)
 * de propósito: structured outputs exige todas as chaves presentes.
 */
export const extractedItemSchema = z.object({
  /** Nome exatamente como impresso na fatura (vira `statement_description`). */
  descricao: z.string(),
  /** Valor como impresso, em texto ("1.234,56"); convertido depois por money.ts. */
  valor_brl: z.string(),
  /** Data da compra `YYYY-MM-DD` (a IA infere o ano pela competência). */
  data: z.string(),
  tipo: extractedTipoSchema,
  /** Preenchido quando a linha é "3/10"; senão null. */
  parcela: z
    .object({ atual: z.number().int(), total: z.number().int() })
    .nullable(),
  /** Sugestão de categoria (idealmente um dos nomes do usuário). */
  categoria_sugerida: z.string().nullable(),
});
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

export const extractedInvoiceSchema = z.object({
  /** Últimos 4 dígitos do cartão, se visíveis (para casar com o cartão). */
  ult4_digitos: z.string().nullable(),
  emissor: z.string().nullable(),
  /** Competência sugerida `YYYY-MM`. */
  competencia_sugerida: z.string().nullable(),
  /** Total da fatura como impresso (texto BRL), para a reconciliação. */
  total_fatura: z.string().nullable(),
  itens: z.array(extractedItemSchema),
});
export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;

// ── Schema dos itens revisados (entrada do Server Action de gravação) ────────

export const importItemInputSchema = z.object({
  description: z.string().trim().min(1, "Informe uma descrição").max(120),
  statement_description: z.string().trim().max(200),
  valor_brl: z.string().trim().min(1, "Informe o valor"),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  category_id: z.string().uuid().nullable().or(z.literal("")),
});
export type ImportItemInput = z.infer<typeof importItemInputSchema>;

export const importPayloadSchema = z.object({
  card_id: z.string().uuid("Selecione o cartão"),
  /** Competência escolhida, forçada para o lote inteiro (`YYYY-MM-01`). */
  reference_month: z.string().regex(/^\d{4}-\d{2}-01$/, "Competência inválida"),
  items: z.array(importItemInputSchema).min(1, "Nenhum lançamento para importar"),
});
export type ImportPayload = z.infer<typeof importPayloadSchema>;

// ── Helpers puros ────────────────────────────────────────────────────────────

/** Normaliza texto para comparação: sem acento, minúsculo, trim. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Só as compras/encargos entram como gasto; créditos e pagamentos são pulados. */
export function isImportable(tipo: ExtractedTipo): boolean {
  return tipo === "compra" || tipo === "encargo" || tipo === "outro";
}

/**
 * Chave estável de deduplicação de um lançamento de fatura.
 * Usa o nome BRUTO da fatura (não o nome amigável, que o usuário pode trocar).
 */
export function dedupeKey(
  statementDescription: string,
  amountCents: number,
  purchaseDate: string,
): string {
  return `${normalizeText(statementDescription)}|${amountCents}|${purchaseDate}`;
}

/** Sinônimos comuns → nome canônico (normalizado) das categorias semeadas. */
const CATEGORY_SYNONYMS: Record<string, string> = {
  supermercado: "mercado",
  hortifruti: "mercado",
  atacado: "mercado",
  atacadao: "mercado",
  restaurante: "alimentacao",
  lanchonete: "alimentacao",
  padaria: "alimentacao",
  ifood: "alimentacao",
  comida: "alimentacao",
  bar: "alimentacao",
  cafe: "alimentacao",
  uber: "transporte",
  "99": "transporte",
  taxi: "transporte",
  posto: "transporte",
  combustivel: "transporte",
  gasolina: "transporte",
  estacionamento: "transporte",
  pedagio: "transporte",
  onibus: "transporte",
  metro: "transporte",
  aluguel: "moradia",
  condominio: "moradia",
  luz: "moradia",
  agua: "moradia",
  energia: "moradia",
  internet: "moradia",
  gas: "moradia",
  farmacia: "saude",
  drogaria: "saude",
  medico: "saude",
  hospital: "saude",
  laboratorio: "saude",
  dentista: "saude",
  cinema: "lazer",
  viagem: "lazer",
  streaming: "assinaturas",
  netflix: "assinaturas",
  spotify: "assinaturas",
  assinatura: "assinaturas",
  disney: "assinaturas",
  hbo: "assinaturas",
  youtube: "assinaturas",
  curso: "educacao",
  escola: "educacao",
  faculdade: "educacao",
  livro: "educacao",
};

/**
 * Mapeia a sugestão de categoria da IA para uma categoria DO PRÓPRIO usuário.
 * Nunca inventa id: retorna o id de uma categoria existente ou null.
 */
export function matchCategoryByName(
  suggested: string | null | undefined,
  categories: { id: string; name: string }[],
): string | null {
  if (!suggested) return null;
  const target = normalizeText(suggested);
  if (!target) return null;

  const byName = new Map(categories.map((c) => [normalizeText(c.name), c.id]));

  const direct = byName.get(target);
  if (direct) return direct;

  const canonical = CATEGORY_SYNONYMS[target];
  if (canonical) {
    const viaSynonym = byName.get(canonical);
    if (viaSynonym) return viaSynonym;
  }
  return null;
}

/**
 * Reconciliação: a soma (com sinal) de TODOS os lançamentos extraídos deve bater
 * com o total impresso da fatura. É a principal guarda contra alucinação/omissão
 * da IA. Se não houver total extraído, não há como checar (ok=true, hasTotal=false).
 */
export function reconcile(
  sumCents: number,
  totalCents: number | null,
  toleranceCents = 100,
): { hasTotal: boolean; deltaCents: number; ok: boolean } {
  if (totalCents == null) return { hasTotal: false, deltaCents: 0, ok: true };
  const deltaCents = sumCents - totalCents;
  return { hasTotal: true, deltaCents, ok: Math.abs(deltaCents) <= toleranceCents };
}

// ── Montagem das linhas de banco (pura; ids injetados) ───────────────────────

export interface ValidatedImportItem {
  /** Id da transação, pré-gerado pelo caller (para ligar parcela sem depender de ordem). */
  id: string;
  description: string;
  statementDescription: string;
  amountCents: number;
  purchaseDate: string;
  categoryId: string | null;
}

export interface ImportContext {
  userId: string;
  cardId: string;
  /** Competência forçada para o lote (`YYYY-MM-01`). */
  referenceMonth: string;
  cycle: CardCycle;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  card_id: string;
  account_id: null;
  category_id: string | null;
  description: string;
  kind: "single";
  total_amount_cents: number;
  purchase_date: string;
  installments_count: 1;
  notes: null;
  statement_description: string;
}

export interface InstallmentRow {
  user_id: string;
  transaction_id: string;
  card_id: string;
  account_id: null;
  number: 1;
  amount_cents: number;
  reference_month: string;
  status: "open";
}

export interface InvoiceRow {
  user_id: string;
  card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  status: "open";
}

export interface ImportRows {
  transactions: TransactionRow[];
  installments: InstallmentRow[];
  invoice: InvoiceRow;
}

/**
 * Monta as linhas a gravar. Cada item vira UMA transação `single` + UMA parcela
 * na competência FORÇADA (não recalcula por data — é uma fatura, tudo cai no mês
 * escolhido). Também monta a linha da fatura (capa) com fechamento/vencimento.
 */
export function buildImportRows(items: ValidatedImportItem[], ctx: ImportContext): ImportRows {
  const transactions: TransactionRow[] = items.map((it) => ({
    id: it.id,
    user_id: ctx.userId,
    card_id: ctx.cardId,
    account_id: null,
    category_id: it.categoryId,
    description: it.description,
    kind: "single",
    total_amount_cents: it.amountCents,
    purchase_date: it.purchaseDate,
    installments_count: 1,
    notes: null,
    statement_description: it.statementDescription,
  }));

  const installments: InstallmentRow[] = items.map((it) => ({
    user_id: ctx.userId,
    transaction_id: it.id,
    card_id: ctx.cardId,
    account_id: null,
    number: 1,
    amount_cents: it.amountCents,
    reference_month: ctx.referenceMonth,
    status: "open",
  }));

  const [ry, rm0] = ymd(ctx.referenceMonth);
  const ref = invoiceRefForMonth(ry, rm0, ctx.cycle);
  const invoice: InvoiceRow = {
    user_id: ctx.userId,
    card_id: ctx.cardId,
    reference_month: ref.referenceMonth,
    closing_date: ref.closingDate,
    due_date: ref.dueDate,
    status: "open",
  };

  return { transactions, installments, invoice };
}
