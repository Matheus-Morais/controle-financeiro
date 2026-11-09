import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;
type BudgetInstallment = Pick<
  Database["public"]["Tables"]["installments"]["Row"],
  "id" | "transaction_id" | "card_id" | "account_id" | "amount_cents" | "number" | "due_date"
>;

/** Ids por consulta: `.in()` vai na URL, e um mês cheio estoura o limite dela. */
const ID_CHUNK = 80;
const PAGE_SIZE = 500;

export interface CategoryMonthItem {
  installmentId: string;
  transactionId: string;
  categoryId: string | null;
  description: string;
  amountCents: number;
  number: number;
  installmentsCount: number;
  /** Data da compra, ISO `YYYY-MM-DD`. */
  purchaseDate: string;
  cardId: string | null;
  accountId: string | null;
  /** Vencimento — só em contas fora do cartão. */
  dueDate: string | null;
}

/**
 * Orçamento por competência (RN-36). Parcelamentos e contas entram direto.
 * Os demais gastos de cartão entram a partir do fechamento da fatura.
 * Sem filtro, devolve todas as categorias. `null` seleciona os gastos sem categoria.
 */
export async function categoryMonthItems(
  db: DB,
  refMonth: string,
  today: string,
  categoryId?: string | null,
): Promise<CategoryMonthItem[]> {
  const installmentPage = (afterId?: string) => {
    const query = db
      .from("installments")
      .select("id, transaction_id, card_id, account_id, amount_cents, number, due_date")
      .eq("reference_month", refMonth)
      .is("deleted_at", null)
      .order("id")
      .limit(PAGE_SIZE);
    return afterId ? query.gt("id", afterId) : query;
  };

  const [firstPage, invoices] = await Promise.all([
    installmentPage(),
    db.from("invoices").select("card_id").eq("reference_month", refMonth).lte("closing_date", today),
  ]);
  if (invoices.error) throw invoices.error;
  const closedCards = new Set(invoices.data.map((invoice) => invoice.card_id));

  const installments: BudgetInstallment[] = [];
  let page = firstPage;
  for (;;) {
    if (page.error) throw page.error;
    installments.push(...page.data);
    if (page.data.length < PAGE_SIZE) break;
    page = await installmentPage(page.data[PAGE_SIZE - 1].id);
  }
  if (!installments.length) return [];

  const ids = [...new Set(installments.map((i) => i.transaction_id))];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) => {
      const query = db
        .from("transactions")
        .select("id, category_id, kind, description, installments_count, purchase_date")
        .in("id", chunk);
      if (categoryId === null) return query.is("category_id", null);
      return categoryId === undefined ? query : query.eq("category_id", categoryId);
    }),
  );

  const transactions = results.flatMap(({ data, error }) => {
    if (error) throw error;
    return data;
  });
  const tx = new Map(transactions.map((t) => [t.id, t]));

  return installments.flatMap((i) => {
    const t = tx.get(i.transaction_id);
    if (!t) return [];
    if (i.card_id && t.kind !== "installment" && !closedCards.has(i.card_id)) return [];
    return [
      {
        installmentId: i.id,
        transactionId: i.transaction_id,
        categoryId: t.category_id,
        description: t.description,
        amountCents: i.amount_cents,
        number: i.number,
        installmentsCount: t.installments_count,
        purchaseDate: t.purchase_date,
        cardId: i.card_id,
        accountId: i.account_id,
        dueDate: i.due_date,
      },
    ];
  });
}

/** Mesma seleção do detalhe, agrupada para as metas do orçamento. */
export async function budgetSpendingByCategory(db: DB, refMonth: string, today: string) {
  const totals = new Map<string, number>();
  for (const item of await categoryMonthItems(db, refMonth, today)) {
    const key = item.categoryId ?? "none";
    totals.set(key, (totals.get(key) ?? 0) + item.amountCents);
  }
  return totals;
}

export interface OriginTotal {
  /** `card:<id>` ou `account:<id>` — chave estável para o React e para o nome. */
  key: string;
  cardId: string | null;
  accountId: string | null;
  cents: number;
  count: number;
}

/** Soma por cartão/conta, do maior para o menor. */
export function totalsByOrigin(
  items: readonly Pick<CategoryMonthItem, "cardId" | "accountId" | "amountCents">[],
): OriginTotal[] {
  const map = new Map<string, OriginTotal>();
  for (const it of items) {
    const key = it.cardId ? `card:${it.cardId}` : it.accountId ? `account:${it.accountId}` : "none";
    const cur = map.get(key) ?? { key, cardId: it.cardId, accountId: it.accountId, cents: 0, count: 0 };
    cur.cents += it.amountCents;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}
