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
import { addMonths, invoiceRefForMonth, toISO, ymd, type CardCycle } from "./invoice";

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
  /**
   * Nome amigável/legível que a IA cria a partir da descrição bruta (ex.:
   * "PAGSEGURO *IFD" → "iFood", "AMZN MKTP BR*A1B2" → "Amazon"). Vira o
   * `description` exibido/editável na revisão; o `descricao` bruto vira legenda.
   */
  nome_amigavel: z.string(),
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
  /** Bandeira/produto do cartão, se visível (ex.: "Visa", "Mastercard Black"). */
  bandeira: z.string().nullable(),
  /**
   * Data de vencimento impressa na fatura (`YYYY-MM-DD`). É o campo mais confiável
   * para derivar a competência via ciclo do cartão (ver `referenceMonthFromDueDate`).
   */
  vencimento: z.string().nullable(),
  /** Competência sugerida `YYYY-MM` (fallback quando não há vencimento/cartão). */
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
 * Chave estável de deduplicação de um lançamento À VISTA de fatura.
 * Usa o nome BRUTO da fatura (não o nome amigável, que o usuário pode trocar).
 * Serve para itens de mês único; parcelados usam `installmentSignature`.
 */
export function dedupeKey(
  statementDescription: string,
  amountCents: number,
  purchaseDate: string,
): string {
  return `${normalizeText(statementDescription)}|${amountCents}|${purchaseDate}`;
}

/**
 * Token de parcela em QUALQUER posição do nome, não só no fim:
 * "01/04", "(1/4)", "Parcela 1 de 4", "PARC 01/04". Diferente de
 * `INSTALLMENT_SUFFIX` (que só limpa o título amigável no fim), este é usado
 * para neutralizar o contador dentro do nome bruto ao gerar a assinatura.
 */
const INSTALLMENT_TOKEN =
  /\(?\s*(?:parcela\s+|parc\.?\s+)?\d{1,3}\s*(?:\/|\s+de\s+)\s*\d{1,3}\s*\)?/gi;

/**
 * Assinatura estável de uma COMPRA PARCELADA, para deduplicar entre faturas de
 * meses diferentes — o caso em que a dedupe por (nome+valor+data no mês) falha.
 *
 * Ao subir a fatura do mês seguinte, a MESMA compra parcelada reaparece, mas:
 * - o número da parcela no nome muda ("01/03" → "02/03") — removido aqui;
 * - a parcela cai num mês onde uma parcela futura JÁ foi materializada num
 *   upload anterior — por isso a comparação é feita no cartão inteiro, sem mês;
 * - a data da compra pode ser reinterpretada pela IA entre faturas — ignorada.
 *
 * Sobram os comparáveis estáveis que identificam a mesma compra parcelada:
 * nome (sem contador) + valor da parcela + total de parcelas. Como o usuário
 * pode comprar parcelado no mesmo lugar mais de uma vez, o nome sozinho não
 * basta — o total de parcelas e o valor da parcela é que dão a discriminação.
 */
export function installmentSignature(
  statementDescription: string,
  parcelAmountCents: number,
  totalInstallments: number,
): string {
  const merchant = normalizeText(
    statementDescription.replace(INSTALLMENT_TOKEN, " ").replace(/\s+/g, " "),
  );
  return `${merchant}|${parcelAmountCents}|${totalInstallments}`;
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
   * `null` = à vista. As parcelas futuras (número atual+1..total) são propagadas
   * para as competências seguintes por `buildImportRows`.
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
  /** Capa de cada competência tocada (a da fatura + as das parcelas futuras). */
  invoices: InvoiceRow[];
}

/**
 * Monta as linhas a gravar. Cada item vira UMA transação. Para as parcelas:
 * - Item com parcela (`installment`): a transação fica `installment` com
 *   `installments_count = total`; cria-se a parcela ATUAL na competência forçada
 *   e PROPAGAM-SE as seguintes (atual+1..total) para as competências
 *   subsequentes. As anteriores (1..atual-1) não são criadas — pertencem a
 *   faturas passadas (histórico).
 * - Sem parcela (ou recorrente): uma parcela única na competência forçada.
 * Também monta a capa de cada fatura tocada.
 */
export function buildImportRows(items: ValidatedImportItem[], ctx: ImportContext): ImportRows {
  const [ry, rm0] = ymd(ctx.referenceMonth);

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

  const installments: InstallmentRow[] = [];
  for (const it of items) {
    // Recorrente ignora parcela; só a ocorrência do mês (o cron materializa o resto).
    const parcel = !it.recurringId ? it.installment : null;
    if (!parcel) {
      installments.push({
        user_id: ctx.userId,
        transaction_id: it.id,
        card_id: ctx.cardId,
        account_id: null,
        number: 1,
        amount_cents: it.amountCents,
        reference_month: ctx.referenceMonth,
        status: "open",
      });
      continue;
    }
    // Parcela atual (competência forçada) + as futuras nas competências seguintes.
    for (let n = parcel.number; n <= parcel.count; n++) {
      const [y, m0] = addMonths(ry, rm0, n - parcel.number);
      installments.push({
        user_id: ctx.userId,
        transaction_id: it.id,
        card_id: ctx.cardId,
        account_id: null,
        number: n,
        amount_cents: it.amountCents,
        reference_month: toISO(y, m0, 1),
        status: "open",
      });
    }
  }

  // Uma capa por competência distinta tocada pelas parcelas.
  const months = [...new Set(installments.map((i) => i.reference_month))].sort();
  const invoices: InvoiceRow[] = months.map((m) => {
    const [y, m0] = ymd(m);
    const ref = invoiceRefForMonth(y, m0, ctx.cycle);
    return {
      user_id: ctx.userId,
      card_id: ctx.cardId,
      reference_month: ref.referenceMonth,
      closing_date: ref.closingDate,
      due_date: ref.dueDate,
      status: "open",
    };
  });

  return { transactions, installments, invoices };
}
