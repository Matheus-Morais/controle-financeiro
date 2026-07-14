import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { DeleteButton } from "@/components/delete-button";
import { RecurringToggle } from "@/components/recurring-toggle";
import { deleteRecurring } from "./actions";

export default async function RecorrentesPage() {
  const supabase = await createClient();

  const [{ data: recurrings }, { data: cards }, { data: accounts }] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("id, description, amount_cents, billing_day, card_id, account_id, active")
      .order("created_at", { ascending: false }),
    supabase.from("cards").select("id, name"),
    supabase.from("accounts").select("id, name"),
  ]);

  const nameById = new Map<string, string>();
  for (const c of cards ?? []) nameById.set(c.id, c.name);
  for (const a of accounts ?? []) nameById.set(a.id, a.name);

  const activeTotal = (recurrings ?? [])
    .filter((r) => r.active)
    .reduce((s, r) => s + r.amount_cents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recorrentes</h1>
        <Link
          href="/recorrentes/novo"
          className="flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Nova
        </Link>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <p className="text-xs text-neutral-500">Total mensal em assinaturas ativas</p>
        <p className="text-2xl font-bold">{formatCents(activeTotal)}</p>
      </div>

      {recurrings && recurrings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {recurrings.map((r) => {
            const source = r.card_id ?? r.account_id;
            return (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    <Repeat size={14} className="shrink-0 text-brand" />
                    {r.description}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {source ? nameById.get(source) ?? "—" : "—"} · dia {r.billing_day}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold">{formatCents(r.amount_cents)}</span>
                  <RecurringToggle id={r.id} active={r.active} />
                  <DeleteButton
                    onDelete={deleteRecurring.bind(null, r.id)}
                    confirmText="Excluir assinatura? Lançamentos já criados serão mantidos."
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-neutral-500">
          Nenhuma assinatura cadastrada. Cadastre para lançar automaticamente todo mês.
        </p>
      )}
    </div>
  );
}
