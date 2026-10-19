import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

/** Ids por consulta: `.in()` vai na URL, e um mês cheio estoura o limite dela. */
const ID_CHUNK = 80;

export interface CategoryMonthItem {
  installmentId: string;
  transactionId: string;
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
 * Parcelas de UMA categoria numa competência: o quê, quanto e em qual cartão
 * (ou conta). É a mesma competência e a mesma regra de exclusão que o orçamento
 * usa (`spending_by_category`): parcelas com soft-delete não entram, então a
 * soma desta lista bate com o "Gasto" da categoria no orçamento.
 *
 * `categoryId = null` devolve os gastos SEM categoria.
 *
 * A categoria mora na transação, não na parcela, e a tipagem do projeto não
 * aceita select com embed — então são as parcelas do mês primeiro e, em seguida,
 * as transações delas (em lotes) já filtradas pela categoria.
 */
export async function categoryMonthItems(
  db: DB,
  categoryId: string | null,
  refMonth: string,
): Promise<CategoryMonthItem[]> {
  const { data: installments } = await db
    .from("installments")
    .select("id, transaction_id, card_id, account_id, amount_cents, number, due_date")
    .eq("reference_month", refMonth)
    .is("deleted_at", null);
  if (!installments?.length) return [];

  const ids = [...new Set(installments.map((i) => i.transaction_id))];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) => {
      const query = db
        .from("transactions")
        .select("id, description, installments_count, purchase_date")
        .in("id", chunk);
      return categoryId ? query.eq("category_id", categoryId) : query.is("category_id", null);
    }),
  );

  const tx = new Map(results.flatMap(({ data }) => data ?? []).map((t) => [t.id, t]));

  return installments.flatMap((i) => {
    const t = tx.get(i.transaction_id);
    if (!t) return [];
    return [
      {
        installmentId: i.id,
        transactionId: i.transaction_id,
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
