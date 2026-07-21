"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { accountSchema } from "@/lib/schemas";
import type { AccountType } from "@/types/database";

type CreateState =
  | {
      error?: string;
      ok?: boolean;
      account?: { id: string; name: string; type: AccountType; color: string | null };
    }
  | undefined;

const PALETTE = ["#0ea5e9", "#16a34a", "#8b5cf6", "#f97316", "#ec4899", "#14b8a6", "#6366f1", "#64748b"];

function revalidate() {
  revalidatePath("/config/contas");
  revalidatePath("/gastos/novo");
  revalidatePath("/recorrentes/novo");
  revalidatePath("/contas");
}

export async function createAccount(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { count } = await supabase
    .from("accounts")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", user.id);
  const color = parsed.data.color || PALETTE[(count ?? 0) % PALETTE.length];

  const { data, error } = await supabase
    .from("accounts")
    .insert({ user_id: user.id, name: parsed.data.name, type: parsed.data.type, color, is_default: false })
    .select("id, name, type, color")
    .single();
  if (error) return { error: error.message };

  revalidate();
  return { ok: true, account: data };
}

export async function updateAccount(
  id: string,
  patch: { name?: string; type?: AccountType; color?: string },
): Promise<void> {
  const supabase = await createClient();
  const update: { name?: string; type?: AccountType; color?: string } = {};
  if (patch.name !== undefined && patch.name.trim().length > 0) update.name = patch.name.trim();
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.color !== undefined) update.color = patch.color;
  if (Object.keys(update).length === 0) return;

  await supabase.from("accounts").update(update).eq("id", id);
  revalidate();
}

/**
 * Exclui uma conta. Bloqueia se houver lançamentos (gastos ou recorrentes)
 * usando a conta — do contrário perderíamos o vínculo dos gastos existentes.
 */
export async function deleteAccount(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const [{ count: txCount }, { count: recCount }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", id),
    supabase
      .from("recurring_expenses")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", id),
  ]);

  if ((txCount ?? 0) > 0 || (recCount ?? 0) > 0) {
    return {
      error: "Esta conta tem lançamentos vinculados. Reatribua ou exclua os gastos antes.",
    };
  }

  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidate();
  return {};
}
