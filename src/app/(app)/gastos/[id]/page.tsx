import { notFound } from "next/navigation";
import Link from "next/link";
import { CreditCard, Pencil, Repeat, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BackLink, HeaderIconLink } from "@/components/back-link";
import { currentReferenceMonth, formatDayMonth, formatMonthLabel } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { formatCents } from "@/lib/money";
import { ExpenseScopeDelete } from "@/components/expense-scope-delete";
import { DeleteExpenseButton } from "@/components/delete-expense-button";

const MONTH_RE = /^\d{4}-\d{2}-01$/;

const KIND_LABEL = {
  single: "À vista",
  installment: "Parcelado",
  recurring: "Assinatura",
} as const;

/**
 * Detalhe de um gasto — a tela que faltava.
 *
 * Antes, tocar num item da fatura ia direto para a edição, e a edição recusa
 * gastos recorrentes (o valor deles vem do template, não da ocorrência): a aba
 * "Recorrente" caía num 404 sem explicação. Aqui as três naturezas cabem, e é
 * daqui que saem as exclusões — por competência (reversível) e definitiva.
 */
export default async function GastoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes } = await searchParams;
  const supabase = await createClient();

  // `maybeSingle`: transação inexistente é 404 de conteúdo, não erro de query.
  const [{ data: tx }, tz] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, card_id, account_id, category_id, recurring_id, description, kind, total_amount_cents, purchase_date, installments_count, statement_description, notes",
      )
      .eq("id", id)
      .maybeSingle(),
    sessionTimezone(supabase),
  ]);
  if (!tx) notFound();

  const [{ data: parcels }, { data: card }, { data: account }, { data: category }] =
    await Promise.all([
      supabase
        .from("installments")
        .select("id, number, amount_cents, reference_month, status, deleted_at, due_date")
        .eq("transaction_id", id)
        .order("reference_month"),
      tx.card_id
        ? supabase.from("cards").select("id, name, color").eq("id", tx.card_id).maybeSingle()
        : Promise.resolve({ data: null }),
      tx.account_id
        ? supabase.from("accounts").select("id, name, color").eq("id", tx.account_id).maybeSingle()
        : Promise.resolve({ data: null }),
      tx.category_id
        ? supabase.from("categories").select("id, name, color").eq("id", tx.category_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const items = parcels ?? [];
  const currentMonth = currentReferenceMonth(tz);

  // Competência em foco: a que veio na URL (navegação a partir de uma fatura),
  // senão a primeira ainda não vencida — e, se todas já passaram, a última.
  const focusMonth =
    mes && MONTH_RE.test(mes) && items.some((p) => p.reference_month === mes)
      ? mes
      : (items.find((p) => p.reference_month >= currentMonth)?.reference_month ??
        items[items.length - 1]?.reference_month ??
        currentMonth);

  const focused = items.find((p) => p.reference_month === focusMonth) ?? null;
  // "Deste mês em diante" só faz sentido com competência futura — ou numa
  // assinatura, que por definição não tem fim conhecido.
  const hasFuture =
    tx.kind === "recurring" || items.some((p) => p.reference_month > focusMonth && !p.deleted_at);

  const liveTotal = items
    .filter((p) => !p.deleted_at)
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const source = card ?? account;
  const isCard = card != null;
  const backHref = card ? `/cartoes/${card.id}?mes=${focusMonth}` : `/contas?mes=${focusMonth}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackLink href={backHref} label={card ? "Voltar para a fatura" : "Voltar para as contas"} />
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{tx.description}</h1>
        {tx.kind !== "recurring" && (
          <HeaderIconLink
            href={`/gastos/${tx.id}/editar?mes=${focusMonth}`}
            label="Editar gasto"
            edge
          >
            <Pencil size={20} />
          </HeaderIconLink>
        )}
      </div>

      {/* Capa: total vivo + natureza do gasto */}
      <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <p className="text-xs text-neutral-500">
          {tx.kind === "installment" ? "Total do parcelamento" : "Valor"}
        </p>
        <p className="text-3xl font-bold">{formatCents(liveTotal)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {tx.kind === "recurring" ? <Repeat size={12} /> : null}
            {KIND_LABEL[tx.kind as keyof typeof KIND_LABEL]}
            {tx.kind === "installment" && ` em ${tx.installments_count}x`}
          </span>
          {source && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {isCard ? <CreditCard size={12} /> : <Wallet size={12} />}
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: source.color ?? "#64748b" }}
              />
              {source.name}
            </span>
          )}
          {category && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: category.color ?? "#94a3b8" }}
              />
              {category.name}
            </span>
          )}
        </div>
      </div>

      <dl className="flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm dark:bg-neutral-900">
        <Row label="Compra em" value={formatDayMonth(tx.purchase_date)} />
        {tx.statement_description && (
          <Row label="Na fatura" value={tx.statement_description} />
        )}
        {tx.notes && <Row label="Observação" value={tx.notes} />}
      </dl>

      {/* Competências: onde o gasto pesa mês a mês */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">
          {tx.kind === "installment" ? "Parcelas" : "Competências"}
        </h2>
        {items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {items.map((p) => {
              const isDeleted = p.deleted_at != null;
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900 ${
                    isDeleted ? "opacity-50" : ""
                  } ${p.reference_month === focusMonth ? "ring-1 ring-brand" : ""}`}
                >
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${isDeleted ? "line-through" : ""}`}>
                      {formatMonthLabel(p.reference_month)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {isDeleted && "Excluída · "}
                      {tx.installments_count > 1 && `Parcela ${p.number}/${tx.installments_count}`}
                      {tx.installments_count > 1 && p.due_date ? " · " : ""}
                      {p.due_date && `vence ${formatDayMonth(p.due_date)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`font-semibold ${isDeleted ? "line-through" : ""}`}>
                      {formatCents(p.amount_cents)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        p.status === "paid"
                          ? "bg-brand/10 text-brand"
                          : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                      }`}
                    >
                      {p.status === "paid" ? "Paga" : "Aberta"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-neutral-500">
            Este gasto não tem nenhuma parcela — provavelmente todas foram excluídas.
          </p>
        )}
      </section>

      {tx.kind === "recurring" && (
        <Link
          href="/recorrentes"
          className="flex items-center gap-3 rounded-2xl border border-dashed border-neutral-300 p-4 text-sm dark:border-neutral-700"
        >
          <Repeat className="shrink-0 text-brand" size={20} />
          <span className="text-neutral-600 dark:text-neutral-300">
            Lançamento gerado por uma assinatura. Valor, dia e cartão são editados em{" "}
            <span className="font-medium text-brand">Recorrentes</span>.
          </span>
        </Link>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Excluir</h2>
        {focused ? (
          <>
            <p className="text-xs text-neutral-500">
              Escopo em {formatMonthLabel(focusMonth)}. Meses anteriores são sempre preservados e
              a exclusão por competência pode ser desfeita.
            </p>
            <ExpenseScopeDelete
              transactionId={tx.id}
              cardId={tx.card_id}
              month={focusMonth}
              hasFuture={hasFuture}
              deleted={focused.deleted_at != null}
            />
          </>
        ) : (
          <p className="text-xs text-neutral-500">
            Sem parcela na competência em foco — só resta a exclusão definitiva.
          </p>
        )}

        <DeleteExpenseButton
          transactionId={tx.id}
          installmentsCount={items.length}
          isRecurring={tx.kind === "recurring" && tx.recurring_id != null}
          redirectTo={backHref}
        />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}
