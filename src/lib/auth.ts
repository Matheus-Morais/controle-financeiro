import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";

/**
 * Usuário da sessão, deduplicado por request.
 *
 * `supabase.auth.getUser()` NÃO valida o JWT localmente: cada chamada é uma ida
 * de rede ao auth server do Supabase. O layout da área logada e a página que ele
 * envolve chamavam cada um o seu — dois round-trips no caminho crítico de toda
 * navegação, e um terceiro quando a página também precisava do `user.id` para
 * materializar recorrentes.
 *
 * O `cache()` do React tem escopo de REQUEST: as chamadas dentro do mesmo render
 * compartilham a resposta. Por isso a função não recebe o client como argumento —
 * o cache é indexado pelos argumentos, e cada `createClient()` devolve uma
 * instância nova, o que daria cache miss a cada chamador. Criar o client aqui
 * dentro é barato (só lê cookies); a ida à rede é que não é.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
