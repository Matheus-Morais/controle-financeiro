import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Money } from "@/components/money";
import { HideValuesToggle } from "@/components/hide-values-toggle";
import { currentReferenceMonth, formatMonthLabel } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { DeleteButton } from "@/components/delete-button";
import { RecurringToggle } from "@/components/recurring-toggle";
import { ChangeCardModal } from "@/components/change-card-modal";
import { deleteRecurring } from "./actions";

interface Row {
  id: string;
  description: string;
  amountCents: number;
  billingDay: number;
  cardId: string | null;
  active: boolean;
  sourceName: string;
  sourceColor: string;
}

export default async function RecorrentesPage() {
  const supabase = await createClient();

  const [{ data: recurrings }, { data: cards }, { data: accounts }] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("id, description, amount_cents, billing_day, card_id, account_id, active")
      .order("created_at", { ascending: false }),
    // `color` entra na query para a bolinha da origem: a tela não distinguia
    // visualmente o cartão de cada assinatura, e é a informação que o usuário
    // mais procura aqui depois do valor.
    supabase.from("cards").select("id, name, color, active"),
    supabase.from("accounts").select("id, name, color"),
  ]);

  const sourceById = new Map<string, { name: string; color: string }>();
  for (const c of cards ?? []) sourceById.set(c.id, { name: c.name, color: c.color ?? "#64748b" });
  for (const a of accounts ?? []) sourceById.set(a.id, { name: a.name, color: a.color ?? "#64748b" });

  // Cartões ativos como destino da troca de cartão.
  const activeCards = (cards ?? [])
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));
  const monthLabel = formatMonthLabel(currentReferenceMonth(await sessionTimezone(supabase)));

  const rows: Row[] = (recurrings ?? []).map((r) => {
    const source = r.card_id ?? r.account_id;
    const resolved = source ? sourceById.get(source) : undefined;
    return {
      id: r.id,
      description: r.description,
      amountCents: r.amount_cents,
      billingDay: r.billing_day,
      cardId: r.card_id,
      active: r.active,
      sourceName: resolved?.name ?? "—",
      sourceColor: resolved?.color ?? "#64748b",
    };
  });

  // Ativas e pausadas em seções separadas: antes se misturavam na mesma lista e
  // só a pílula distinguia — o total do topo não batia com o que se via.
  const activeRows = rows.filter((r) => r.active);
  const pausedRows = rows.filter((r) => !r.active);
  const activeTotal = activeRows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">Recorrentes</h1>
        <HideValuesToggle />
        <Link
          href="/recorrentes/novo"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Nova
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="Por mês" value={<Money cents={activeTotal} />} />
        <SummaryTile label="Ativas" value={String(activeRows.length)} accent="text-emerald-600" />
        <SummaryTile label="Pausadas" value={String(pausedRows.length)} />
      </div>

      {rows.length > 0 ? (
        <>
          {activeRows.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">Ativas</h2>
              <ul className="flex flex-col gap-2">
                {activeRows.map((r) => (
                  <RecurringCard
                    key={r.id}
                    row={r}
                    activeCards={activeCards}
                    monthLabel={monthLabel}
                  />
                ))}
              </ul>
            </section>
          )}

          {pausedRows.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold text-neutral-500">Pausadas</h2>
              <ul className="flex flex-col gap-2">
                {pausedRows.map((r) => (
                  <RecurringCard
                    key={r.id}
                    row={r}
                    activeCards={activeCards}
                    monthLabel={monthLabel}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-neutral-500">
          <Repeat size={28} className="text-neutral-300" />
          <p>Nenhuma assinatura cadastrada.</p>
          <p className="text-xs">
            Cadastre o que se repete todo mês (streaming, academia, luz) e o lançamento passa a
            aparecer sozinho na fatura de cada mês.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Item da lista em DUAS linhas.
 *
 * Na versão anterior, descrição, valor e três controles disputavam a mesma
 * linha num `flex gap-1` sem `flex-1`/`shrink-0`: num aparelho de 375px a
 * descrição colapsava e os alvos de toque ficavam colados. Agora a primeira
 * linha é informação (origem, nome, valor) e a segunda é ação, com os alvos
 * afastados um do outro.
 */
function RecurringCard({
  row,
  activeCards,
  monthLabel,
}: {
  row: Row;
  activeCards: { id: string; name: string }[];
  monthLabel: string;
}) {
  return (
    <li
      className={`flex flex-col gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900 ${
        row.active ? "" : "opacity-60"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-full"
          style={{ backgroundColor: row.sourceColor }}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-medium">
            <Repeat size={14} className="shrink-0 text-brand" />
            <span className="truncate">{row.description}</span>
          </p>
          <p className="truncate text-xs text-neutral-500">
            {row.sourceName} · dia {row.billingDay}
          </p>
        </div>
        <Money cents={row.amountCents} className="shrink-0 font-semibold" />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-neutral-100 pt-1 dark:border-neutral-800">
        <RecurringToggle id={row.id} active={row.active} />
        <div className="flex items-center gap-1">
          <ChangeCardModal
            recurringId={row.id}
            description={row.description}
            currentCardId={row.cardId}
            monthLabel={monthLabel}
            cards={activeCards}
          />
          <DeleteButton
            onDelete={deleteRecurring.bind(null, row.id)}
            confirmText="Excluir esta assinatura? Os lançamentos já criados continuam nas faturas — para apagar tudo, abra um deles e use 'Excluir para sempre'."
          />
        </div>
      </div>
    </li>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-neutral-900">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-base font-bold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
