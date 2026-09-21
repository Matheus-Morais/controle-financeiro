import Link from "next/link";
import { Plus, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatDayMonth, shiftReferenceMonth } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { Money } from "@/components/money";
import { HideValuesToggle } from "@/components/hide-values-toggle";
import { ExpenseSearchForm } from "@/components/expense-search-form";

/** Teto de linhas. Busca é para achar um lançamento, não para exportar a base. */
const LIMIT = 100;

/** Meses de histórico oferecidos no filtro de período. */
const MONTHS_BACK = 24;

/**
 * Teto das transações que casam com o filtro. Alto de propósito: ele só serve
 * para a lista de ids não crescer sem limite; quem corta o resultado é o LIMIT
 * das parcelas.
 */
const TX_LIMIT = 1000;

type TransactionRow = {
  id: string;
  description: string;
  statement_description: string | null;
  installments_count: number;
};

/**
 * Busca de lançamentos.
 *
 * Existe porque, até aqui, achar um gasto passado exigia lembrar em qual cartão
 * e em qual competência ele caiu e abrir a fatura correspondente. Esta tela
 * varre todas as competências de uma vez.
 *
 * A consulta é sobre PARCELAS, não sobre transações: é a parcela que carrega a
 * competência, o valor do mês e o soft-delete (RN-20). Um parcelado em 10x
 * aparece uma vez por mês em que pesa, que é como o usuário pensa nele.
 *
 * A busca textual é por descrição e também pelo nome bruto da fatura, porque é
 * esse que quem importou o PDF costuma lembrar.
 */
export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string; categoria?: string }>;
}) {
  const { q, de, ate, categoria } = await searchParams;
  const supabase = await createClient();
  const tz = await sessionTimezone(supabase);

  const thisMonth = currentReferenceMonth(tz);
  // Padrão: últimos 6 meses até o mês atual — recorte que responde à maioria
  // das buscas sem varrer a base inteira.
  const from = de || shiftReferenceMonth(thisMonth, -5);
  const to = ate || thisMonth;
  const term = (q ?? "").trim();

  // Cartões e contas vêm inteiros: são poucas linhas por usuário e resolvem o
  // nome/cor de qualquer lançamento sem uma consulta por item.
  const [{ data: categories }, { data: cards }, { data: accounts }] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("cards").select("id, name, color"),
    supabase.from("accounts").select("id, name, color"),
  ]);

  const safeTerm = sanitizeTerm(term);
  const filtering = Boolean(safeTerm || categoria);

  // Os embeds do PostgREST não têm tipo aqui (`Relationships: []` em
  // types/database.ts), então a tela lê em duas etapas, como o resto do
  // projeto. Com filtro, as transações vêm primeiro — é o que restringe o
  // conjunto, e aplicar o teto de linhas antes disso devolveria as 100
  // primeiras parcelas do período e só então descartaria quase todas.
  let matchedIds: string[] | null = null;
  let txById = new Map<string, TransactionRow>();

  if (filtering) {
    let txQuery = supabase
      .from("transactions")
      .select("id, description, statement_description, installments_count")
      .limit(TX_LIMIT);

    if (safeTerm) {
      // O nome bruto da fatura entra na busca junto com o apelido: quem
      // importou a fatura lembra de "PAGSEGURO *PADARIA", não do nome que o
      // app arrumou.
      const like = `%${safeTerm}%`;
      txQuery = txQuery.or(`description.ilike.${like},statement_description.ilike.${like}`);
    }
    if (categoria) txQuery = txQuery.eq("category_id", categoria);

    const { data: txs } = await txQuery;
    matchedIds = (txs ?? []).map((t) => t.id);
    txById = new Map((txs ?? []).map((t) => [t.id, t]));
  }

  let query = supabase
    .from("installments")
    .select("id, transaction_id, card_id, account_id, amount_cents, reference_month, number, due_date")
    .is("deleted_at", null)
    .gte("reference_month", from)
    .lte("reference_month", to)
    .order("reference_month", { ascending: false })
    .limit(LIMIT);

  if (matchedIds) query = query.in("transaction_id", matchedIds);

  // Filtro que não casou com nenhuma transação: `in` com lista vazia devolveria
  // tudo em algumas versões do PostgREST, então nem consultamos.
  const { data: rows } = matchedIds && matchedIds.length === 0 ? { data: [] } : await query;

  if (!filtering && rows && rows.length > 0) {
    const { data: txs } = await supabase
      .from("transactions")
      .select("id, description, statement_description, installments_count")
      .in("id", [...new Set(rows.map((r) => r.transaction_id))]);
    txById = new Map((txs ?? []).map((t) => [t.id, t]));
  }

  const cardById = new Map((cards ?? []).map((c) => [c.id, c]));
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));

  const items = (rows ?? []).map((r) => {
    const tx = txById.get(r.transaction_id);
    const origin =
      (r.card_id ? cardById.get(r.card_id) : null) ??
      (r.account_id ? accountById.get(r.account_id) : null);
    return {
      installmentId: r.id,
      transactionId: r.transaction_id,
      description: tx?.description ?? "—",
      amountCents: r.amount_cents,
      referenceMonth: r.reference_month,
      number: r.number,
      count: tx?.installments_count ?? 1,
      dueDate: r.due_date,
      origin: origin?.name ?? "—",
      color: origin?.color ?? "#64748b",
    };
  });

  const total = items.reduce((s, i) => s + i.amountCents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">Gastos</h1>
        <HideValuesToggle />
        <Link
          href="/gastos/novo"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Lançar
        </Link>
      </div>

      <ExpenseSearchForm
        term={term}
        from={from}
        to={to}
        categoryId={categoria ?? ""}
        categories={categories ?? []}
        months={monthOptions(thisMonth)}
      />

      <p className="text-sm text-neutral-500">
        {items.length === 0
          ? "Nenhum lançamento"
          : `${items.length}${items.length === LIMIT ? "+" : ""} ${
              items.length === 1 ? "lançamento" : "lançamentos"
            } · `}
        {items.length > 0 ? <Money cents={total} className="font-semibold" /> : null}
      </p>

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.installmentId}>
              <Link
                href={`/gastos/${it.transactionId}?mes=${it.referenceMonth}`}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
              >
                <span
                  className="h-9 w-9 shrink-0 rounded-full"
                  style={{ backgroundColor: it.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.description}</span>
                  <span className="block text-xs text-neutral-500">
                    {it.origin} · {monthLabel(it.referenceMonth)}
                    {it.count > 1 ? ` · ${it.number}/${it.count}` : ""}
                    {it.dueDate ? ` · vence ${formatDayMonth(it.dueDate)}` : ""}
                  </span>
                </span>
                <Money cents={it.amountCents} className="shrink-0 font-semibold" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <SearchX size={28} className="text-neutral-300" />
          <p className="text-sm text-neutral-500">
            {term
              ? `Nada encontrado para “${term}” no período escolhido.`
              : "Nenhum lançamento no período escolhido."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Deixa o termo seguro para entrar no filtro `or` do PostgREST.
 *
 * Dois perigos se somam numa string só: `%` e `_` são curingas do `ilike`, e
 * vírgula, parênteses, aspas e barra invertida são a pontuação com que o
 * PostgREST separa as condições do `or` — um deles solto muda o significado do
 * filtro. Como nenhum tem valor de busca numa descrição de gasto, todos saem.
 */
function sanitizeTerm(value: string): string {
  return value.replace(/[%_\\,()"]/g, " ").trim();
}

function monthLabel(referenceMonth: string): string {
  const [year, month] = referenceMonth.split("-");
  return `${month}/${year}`;
}

function monthOptions(thisMonth: string): { value: string; label: string }[] {
  return Array.from({ length: MONTHS_BACK }, (_, i) => {
    const value = shiftReferenceMonth(thisMonth, -i);
    return { value, label: monthLabel(value) };
  });
}
