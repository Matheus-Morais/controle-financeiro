/* ─── Skeletons de carregamento ──────────────────────────────────────────────
   Placeholders animados exibidos durante transições de rota (arquivos loading.tsx).
   Preferimos skeletons a um spinner central: a silhueta do conteúdo aparece na
   hora, a troca de tela fica sem "salto" e a espera parece mais curta. */

/** Bloco base com efeito de pulsar. Combine para montar a silhueta de cada tela. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-neutral-200/80 dark:bg-neutral-800/80 ${className}`.trim()}
    />
  );
}

/** Linha de lista/cartão: bloco arredondado no padrão dos itens da aplicação. */
function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-4 w-14" />
    </div>
  );
}

/** Silhueta genérica de tela: título + algumas linhas. Serve para a maioria das
    telas da área logada (listas e dashboards). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-8 w-40" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Bloco desenhado SOBRE a silhueta de um cartão colorido — precisa de um tom
    mais forte que o `Skeleton` base para aparecer contra ela. */
function OnCardBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-neutral-300/90 dark:bg-neutral-700/90 ${className}`.trim()}
    />
  );
}

/** Silhueta da lista de cartões: título + botão "Novo" e os cartões coloridos
    (linha com nome/total e o chip de fecha/vence). */
export function CardListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-20 rounded-xl" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl bg-neutral-200/70 p-4 shadow-sm dark:bg-neutral-800/70"
          >
            <div className="flex items-center gap-3">
              <OnCardBlock className="h-6 w-6 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <OnCardBlock className="h-4 w-2/5" />
                <OnCardBlock className="h-3 w-1/4" />
              </div>
              <OnCardBlock className="h-6 w-20" />
            </div>
            <OnCardBlock className="h-9 w-52 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Silhueta da tela de detalhe do cartão: cabeçalho, seletor de mês, resumo da
    fatura e lista de lançamentos. */
export function CardDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-7 flex-1 max-w-[60%]" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
