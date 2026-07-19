"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { categorySchema } from "@/lib/schemas";

type ActionState =
  | { error?: string; ok?: boolean; category?: { id: string; name: string; color: string | null } }
  | undefined;

const PALETTE = ["#16a34a", "#0ea5e9", "#8b5cf6", "#ef4444", "#f97316", "#ec4899", "#14b8a6", "#6366f1"];

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { count } = await supabase
    .from("categories")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", user.id);
  const color = parsed.data.color || PALETTE[(count ?? 0) % PALETTE.length];

  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: user.id, name: parsed.data.name, color })
    .select("id, name, color")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/orcamento");
  revalidatePath("/config/categorias");
  return { ok: true, category: data } as ActionState;
}

export async function deleteCategory(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("categories").delete().eq("id", id);
  revalidatePath("/orcamento");
  revalidatePath("/config/categorias");
}

/** Renomeia e/ou recolore uma categoria existente. */
export async function updateCategory(
  id: string,
  patch: { name?: string; color?: string },
): Promise<void> {
  const supabase = await createClient();
  const update: { name?: string; color?: string } = {};
  if (patch.name !== undefined && patch.name.trim().length > 0) update.name = patch.name.trim();
  if (patch.color !== undefined) update.color = patch.color;
  if (Object.keys(update).length === 0) return;

  await supabase.from("categories").update(update).eq("id", id);
  revalidatePath("/orcamento");
  revalidatePath("/config/categorias");
}

/**
 * Define (ou remove) o limite mensal recorrente de uma categoria.
 * Orçamentos recorrentes usam reference_month = null. limite <= 0 remove.
 */
export async function saveBudget(categoryId: string, limitCents: number): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("user_id", user.id)
    .eq("category_id", categoryId)
    .is("reference_month", null)
    .maybeSingle();

  if (limitCents <= 0) {
    if (existing) await supabase.from("budgets").delete().eq("id", existing.id);
  } else if (existing) {
    await supabase.from("budgets").update({ limit_cents: limitCents }).eq("id", existing.id);
  } else {
    await supabase
      .from("budgets")
      .insert({ user_id: user.id, category_id: categoryId, reference_month: null, limit_cents: limitCents });
  }
  revalidatePath("/orcamento");
}
