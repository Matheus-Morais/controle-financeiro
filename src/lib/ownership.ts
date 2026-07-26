import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

/** Tabelas cujo id pode ser referenciado por FK a partir de um formulário. */
type OwnedTable = "cards" | "accounts" | "categories" | "recurring_expenses";

/**
 * Confirma que um id referenciado pertence ao usuário logado.
 *
 * A RLS aprova um insert cujo `user_id` é o do requisitante MESMO que as FKs
 * apontem para registros de outro usuário — a policy só olha a linha inserida,
 * nunca o dono do alvo da FK. Um POST forjado de Server Action com o
 * `category_id` de outra conta gravaria um gasto com id alheio: não vaza dados
 * (a leitura continua filtrada), mas corrompe a integridade e produz relatórios
 * com categoria fantasma.
 *
 * O `select` abaixo já roda sob RLS, então só encontra o registro se ele for do
 * próprio usuário. Devolve o id quando é válido e `null` quando não é — o
 * chamador decide entre recusar ou apenas descartar o vínculo.
 *
 * As migrations 0010 (validação dentro das funções atômicas) e 0011 (FK
 * composta) cobrem o mesmo furo no banco; este helper é a camada da aplicação,
 * para os fluxos que não passam por uma função atômica.
 */
export async function assertOwned(
  db: DB,
  table: OwnedTable,
  id: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  const { data } = await db.from(table).select("id").eq("id", id).maybeSingle();
  return data ? id : null;
}

/** Variante estrita: devolve erro em vez de descartar o vínculo silenciosamente. */
export async function requireOwned(
  db: DB,
  table: OwnedTable,
  id: string,
  label: string,
): Promise<{ error?: string }> {
  const owned = await assertOwned(db, table, id);
  return owned ? {} : { error: `${label} não encontrado.` };
}
