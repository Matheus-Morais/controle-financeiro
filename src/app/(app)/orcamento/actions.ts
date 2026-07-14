"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { categorySchema } from "@/lib/schemas";

type ActionState = { error?: string } | undefined;

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

  const { error } = await supabase
    .from("categories")
    .insert({ user_id: user.id, name: parsed.data.name, color });
  if (error) return { error: error.message };

  revalidatePath("/orcamento");
  return { ok: true } as ActionState;
}

export async function deleteCategory(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("categories").delete().eq("id", id);
  revalidatePath("/orcamento");
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
