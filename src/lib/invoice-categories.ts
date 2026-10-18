import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

export interface ItemCategory {
  name: string;
  color: string | null;
}

/** Ids por consulta: `.in()` vai na URL, e uma fatura grande estoura o limite dela. */
const ID_CHUNK = 80;

/**
 * Categoria de cada transação (`transaction_id → categoria`) dos itens de uma
 * fatura. A função `invoice_items` não devolve a categoria, e a tipagem do
 * projeto não aceita select com embed — então são duas consultas simples, com o
 * client do usuário (RLS). Transação sem categoria fica fora do mapa.
 *
 * A categoria é só informativa: se a leitura falhar, devolve o que conseguiu e a
 * fatura continua aparecendo.
 */
export async function categoriesByTransaction(
  db: DB,
  transactionIds: readonly string[],
): Promise<Map<string, ItemCategory>> {
  const result = new Map<string, ItemCategory>();
  const ids = [...new Set(transactionIds)];
  if (ids.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));

  const [{ data: categories }, txResults] = await Promise.all([
    db.from("categories").select("id, name, color"),
    Promise.all(chunks.map((chunk) => db.from("transactions").select("id, category_id").in("id", chunk))),
  ]);

  const byId = new Map((categories ?? []).map((c) => [c.id, { name: c.name, color: c.color }]));
  for (const { data } of txResults) {
    for (const tx of data ?? []) {
      const category = tx.category_id ? byId.get(tx.category_id) : undefined;
      if (category) result.set(tx.id, category);
    }
  }
  return result;
}
