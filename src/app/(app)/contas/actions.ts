"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Marca (ou desmarca) uma conta/parcela de origem conta como paga. */
export async function toggleBillPaid(installmentId: string, paid: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("installments")
    .update({ status: paid ? "paid" : "open" })
    .eq("id", installmentId)
    .eq("user_id", user.id);

  revalidatePath("/contas");
  revalidatePath("/", "layout");
}
