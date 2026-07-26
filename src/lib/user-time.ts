import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { currentReferenceMonth, todayISO } from "./date";

type DB = SupabaseClient<Database>;

/** Fallback quando o profile ainda não existe (ou não tem timezone). */
export const DEFAULT_TZ = "America/Sao_Paulo";

/**
 * Timezone do usuário logado — ponto único de leitura do profile para decisões
 * de calendário (RN-08).
 *
 * `currentReferenceMonth()` e `todayISO()` aceitam um `tz`, mas só o dashboard
 * passava: para quem está fora de America/Sao_Paulo, na virada do mês o
 * dashboard mostrava um mês e a tela do cartão outro. Pior, `changeRecurringCard`
 * calculava o corte de ciclo com o mês errado — efeito permanente no dado.
 */
export async function userTimezone(db: DB, userId: string): Promise<string> {
  const { data } = await db
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.timezone ?? DEFAULT_TZ;
}

/**
 * Timezone do usuário da sessão — a forma mais curta para Server Components.
 *
 * Dispensa o `userId` porque a RLS já restringe `profiles` à própria linha: o
 * `select` sem filtro devolve no máximo o profile de quem está logado.
 */
export async function sessionTimezone(db: DB): Promise<string> {
  const { data } = await db.from("profiles").select("timezone").maybeSingle();
  return data?.timezone ?? DEFAULT_TZ;
}

/** Competência corrente no timezone da sessão (`YYYY-MM-01`). */
export async function sessionReferenceMonth(db: DB): Promise<string> {
  return currentReferenceMonth(await sessionTimezone(db));
}

/** Data de hoje (`YYYY-MM-DD`) no timezone da sessão. */
export async function sessionTodayISO(db: DB): Promise<string> {
  return todayISO(await sessionTimezone(db));
}

/** Competência corrente no timezone do usuário logado. */
export async function userCurrentReferenceMonth(db: DB, userId: string): Promise<string> {
  return currentReferenceMonth(await userTimezone(db, userId));
}

/** Data de hoje (`YYYY-MM-DD`) no timezone do usuário logado. */
export async function userTodayISO(db: DB, userId: string): Promise<string> {
  return todayISO(await userTimezone(db, userId));
}
