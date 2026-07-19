import Link from "next/link";
import { ChevronRight, CreditCard, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth } from "@/lib/date";
import { formatCents } from "@/lib/money";

export default async function CartoesPage() {
  const supabase = await createClient();

  const { data: cards } = await supabase
    .from("cards")
    .select("id, name, brand, closing_day, due_day, color, last_four")
    .eq("active", true)
    .order("created_at", { ascending: true });

  // Total do mês corrente por cartão.
  const refMonth = currentReferenceMonth();
  const { data: installments } = await supabase
    .from("installments")
    .select("card_id, amount_cents")
    .eq("reference_month", refMonth)
    .not("card_id", "is", null)
    .is("deleted_at", null);

  const totals = new Map<string, number>();
  for (const it of installments ?? []) {
    if (!it.card_id) continue;
    totals.set(it.card_id, (totals.get(it.card_id) ?? 0) + it.amount_cents);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cartões</h1>
        <Link
          href="/cartoes/novo"
          className="flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Novo
        </Link>
      </div>

      {cards && cards.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => (
            <li key={card.id}>
              <Link
                href={`/cartoes/${card.id}`}
                className="flex items-center gap-3 rounded-2xl p-4 text-white shadow-sm"
                style={{ backgroundColor: card.color ?? "#16a34a" }}
              >
                <CreditCard size={24} />
                <div className="flex-1">
                  <p className="font-semibold">{card.name}</p>
                  <p className="text-xs opacity-90">
                    {card.brand ? `${card.brand} · ` : ""}fecha dia {card.closing_day} · vence dia{" "}
                    {card.due_day}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-90">este mês</p>
                  <p className="font-bold">{formatCents(totals.get(card.id) ?? 0)}</p>
                </div>
                <ChevronRight size={18} className="opacity-80" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Link
          href="/cartoes/novo"
          className="flex items-center gap-3 rounded-2xl border border-dashed border-neutral-300 p-6 dark:border-neutral-700"
        >
          <CreditCard className="text-brand" />
          <span className="text-sm">Cadastre seu primeiro cartão para começar.</span>
        </Link>
      )}
    </div>
  );
}
