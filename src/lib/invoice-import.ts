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
  /**
   * `true` quando a IA identifica o lançamento como provável gasto recorrente
   * (assinatura, streaming, academia, seguro, SaaS, etc.). Apenas uma dica — o
   * usuário decide na tela de revisão.
   */
  sugerido_recorrente: z.boolean(),
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
  /** Parcela detectada na fatura (nº atual / total); null quando à vista. */
  parcela: z
    .object({ atual: z.number().int(), total: z.number().int() })
    .nullable()
    .optional(),
  /** Quando true, cria um RecurringExpense além da transação normal. */
  mark_as_recurring: z.boolean().optional(),
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

/**
 * Token de parcela no FIM do nome, em formatos comuns de fatura:
 * "(1/4)", "1/4", "01/04", "Parcela 1 de 4", "PARC 01/04".
 */
const INSTALLMENT_SUFFIX =
  /\s*[-–—]?\s*\(?\s*(?:parcela\s+|parc\.?\s+)?\d{1,3}(?:\s*\/\s*|\s+de\s+)\d{1,3}\s*\)?\s*$/i;

/**
 * Remove o token de parcela do TÍTULO amigável (ex.: "Amazon Marketplace (1/4)"
 * → "Amazon Marketplace"). Só limpa quando a IA de fato detectou parcela, para
 * não mutilar um nome que por acaso termine em "X/Y". O nome BRUTO
 * (`statement_description`, usado na dedupe) nunca passa por aqui.
 */
export function stripInstallmentSuffix(
  descricao: string,
  parcela: { atual: number; total: number } | null,
): string {
  const base = descricao.trim();
  if (!parcela) return base;
  const cleaned = base.replace(INSTALLMENT_SUFFIX, "").trim();
  return cleaned.length > 0 ? cleaned : base;
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
  /**
   * Parcela do lançamento (nº atual / total), quando a fatura indica parcelamento.
   * `null` = à vista. Não gera as parcelas futuras — cada fatura traz a sua.
   */
  installment: { number: number; count: number } | null;
  /**
   * Id do `recurring_expense` (template) quando o item foi marcado como recorrente
   * na revisão. `null` = gasto comum. Quando presente, a transação nasce com
   * `kind = "recurring"` e `recurring_id` apontando para o template — assim cai na
   * aba "Recorrente" da própria fatura, não em "À vista". `installment` é ignorado
   * (assinatura não é parcela).
   */
  recurringId: string | null;
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
  recurring_id: string | null;
  description: string;
  kind: "single" | "installment" | "recurring";
  total_amount_cents: number;
  purchase_date: string;
  installments_count: number;
  notes: null;
  statement_description: string;
}

export interface InstallmentRow {
  user_id: string;
  transaction_id: string;
  card_id: string;
  account_id: null;
  number: number;
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
 * Monta as linhas a gravar. Cada item vira UMA transação + UMA parcela na
 * competência FORÇADA (não recalcula por data — é uma fatura, tudo cai no mês
 * escolhido). Quando o item tem parcela (`installment`), a transação fica como
 * `installment` com `installments_count = total` e a parcela guarda `number =
 * atual`; as parcelas futuras NÃO são geradas (cada fatura traz a sua). Sem
 * parcela, é um gasto `single` (número 1 de 1). Também monta a capa da fatura.
 */
export function buildImportRows(items: ValidatedImportItem[], ctx: ImportContext): ImportRows {
  const transactions: TransactionRow[] = items.map((it) => ({
    id: it.id,
    user_id: ctx.userId,
    card_id: ctx.cardId,
    account_id: null,
    category_id: it.categoryId,
    recurring_id: it.recurringId,
    description: it.description,
    // Recorrente vence parcela: item marcado como recorrente nasce `recurring`.
    kind: it.recurringId ? "recurring" : it.installment ? "installment" : "single",
    total_amount_cents: it.amountCents,
    purchase_date: it.purchaseDate,
    installments_count: it.recurringId ? 1 : it.installment ? it.installment.count : 1,
    notes: null,
    statement_description: it.statementDescription,
  }));

  const installments: InstallmentRow[] = items.map((it) => ({
    user_id: ctx.userId,
    transaction_id: it.id,
    card_id: ctx.cardId,
    account_id: null,
    number: !it.recurringId && it.installment ? it.installment.number : 1,
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
