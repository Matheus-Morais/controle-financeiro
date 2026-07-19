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
