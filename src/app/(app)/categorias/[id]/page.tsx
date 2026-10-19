import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatDayMonth } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { categoryMonthItems, totalsByOrigin } from "@/lib/category-month";
import { sortInvoiceItems } from "@/lib/invoice-items";
import { BackLink } from "@/components/back-link";
import { HideValuesToggle } from "@/components/hide-values-toggle";
import { MonthNav } from "@/components/month-nav";
import { Money } from "@/components/money";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-\d{2}-01$/;
const FALLBACK_COLOR = "#94a3b8";

/** Segmento de rota para os gastos sem categoria (no orçamento a chave é "none"). */
const UNCATEGORIZED = "sem-categoria";

/**
 * Detalhe de uma categoria num mês: o quê, quanto e em qual cartão (ou conta).
 *
 * Usa a competência (`reference_month`) e ignora parcelas excluídas, igual ao
 * "Gasto" do orçamento — a soma aqui bate com o que a linha da categoria mostra.
 */
export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes } = await searchParams;

  const uncategorized = id === UNCATEGORIZED;
  if (!uncategorized && !UUID.test(id)) notFound();

  const supabase = await createClient();
  const tz = await sessionTimezone(supabase);
  const refMonth = mes && MONTH.test(mes) ? mes : currentReferenceMonth(tz);
  const categoryId = uncategorized ? null : id;

  const [{ data: category }, { data: budget }, { data: cards }, { data: accounts }, items] =
    await Promise.all([
      categoryId
        ? supabase.from("categories").select("id, name, color").eq("id", categoryId).maybeSingle()
        : Promise.resolve({ data: { id: "", name: "Sem categoria", color: null } }),
      categoryId
        ? supabase
            .from("budgets")
            .select("limit_cents")
            .eq("category_id", categoryId)
            .is("reference_month", null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("cards").select("id, name, color"),
      supabase.from("accounts").select("id, name, color"),
      categoryMonthItems(supabase, categoryId, refMonth),
    ]);
  if (!category) notFound();

  const cardById = new Map((cards ?? []).map((c) => [c.id, c]));
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const originOf = (cardId: string | null, accountId: string | null) =>
    (cardId ? cardById.get(cardId) : null) ?? (accountId ? accountById.get(accountId) : null);

  const color = category.color ?? FALLBACK_COLOR;
  const total = items.reduce((s, i) => s + i.amountCents, 0);
  const limit = budget?.limit_cents ?? 0;
  const over = limit > 0 && total > limit;
  const pct = limit > 0 ? Math.min(100, Math.round((total / limit) * 100)) : 0;

  const origins = totalsByOrigin(items);
  const sorted = sortInvoiceItems(items.map((i) => ({ ...i, deleted: false })));

  return (
    <div className="flex flex-col gap-4 lg:max-w-5xl">
      <div className="flex items-center gap-2">
        <BackLink href="/orcamento" label="Voltar para o orçamento" />
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-bold">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate">{category.name}</span>
        </h1>
        <HideValuesToggle />
      </div>

      <MonthNav basePath={`/categorias/${id}`} refMonth={refMonth} />

      <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <p className="text-xs text-neutral-500">
          Gasto no mês · {items.length} {items.length === 1 ? "lançamento" : "lançamentos"}
        </p>
        <p className="text-3xl font-bold">
          <Money cents={total} className={over ? "text-red-500" : ""} />
          {limit > 0 && (
            <span className="ml-2 text-sm font-normal text-neutral-400">
              de <Money cents={limit} />
            </span>
          )}
        </p>
        {limit > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <SearchX size={28} className="text-neutral-300" />
          <p className="text-sm text-neutral-500">Nenhum gasto nesta categoria neste mês.</p>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-neutral-500">Por cartão</h2>
            <ul className="flex flex-col gap-1 rounded-2xl bg-white p-2 shadow-sm dark:bg-neutral-900">
              {origins.map((o) => {
                const origin = originOf(o.cardId, o.accountId);
                return (
                  <li key={o.key} className="flex items-center gap-3 px-2 py-1.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: origin?.color ?? FALLBACK_COLOR }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {origin?.name ?? "—"}
                      <span className="ml-1.5 text-xs font-normal text-neutral-400">
                        {o.count} {o.count === 1 ? "lançamento" : "lançamentos"}
                      </span>
                    </span>
                    <Money cents={o.cents} className="shrink-0 text-sm font-semibold" />
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-neutral-500">Lançamentos</h2>
            <ul className="grid gap-2 lg:grid-cols-2">
              {sorted.map((it) => {
                const origin = originOf(it.cardId, it.accountId);
                return (
                  <li key={it.installmentId}>
                    <Link
                      href={`/gastos/${it.transactionId}?mes=${refMonth}`}
                      className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm active:scale-[0.99] dark:bg-neutral-900"
                    >
                      <span
                        className="h-9 w-9 shrink-0 rounded-full"
                        style={{ backgroundColor: origin?.color ?? FALLBACK_COLOR }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{it.description}</span>
                        <span className="block text-xs text-neutral-500">
                          {origin?.name ?? "—"}
                          {it.installmentsCount > 1
                            ? ` · parcela ${it.number}/${it.installmentsCount}`
                            : ""}
                          {` · compra em ${formatDayMonth(it.purchaseDate)}`}
                          {it.dueDate ? ` · vence ${formatDayMonth(it.dueDate)}` : ""}
                        </span>
                      </span>
                      <Money cents={it.amountCents} className="shrink-0 font-semibold" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
