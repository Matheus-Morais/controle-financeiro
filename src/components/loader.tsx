import type { CSSProperties } from "react";

type LoaderProps = {
  /** Diâmetro em px. */
  size?: number;
  /** Espessura do traço em px. */
  stroke?: number;
  /** Classes extras — use para definir a cor (ex.: "text-brand"). A cor vem de currentColor. */
  className?: string;
  style?: CSSProperties;
};

/**
 * Loader "Ring" (inspirado no uiball.com / ldrs) em CSS+SVG puro.
 *
 * Renderiza no servidor (sem hooks, sem "use client") e aparece
 * instantaneamente — ideal para os fallbacks de Suspense (`loading.tsx`).
 * A cor é herdada de `currentColor`; defina-a no elemento (ex.: `text-brand`).
 */
export function Loader({ size = 44, stroke = 4, className = "", style }: LoaderProps) {
  const half = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="status"
      aria-label="Carregando"
      className={`animate-spin ${className}`.trim()}
      style={style}
    >
      {/* trilha de fundo */}
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="opacity-20"
      />
      {/* arco que gira */}
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.72}
      />
    </svg>
  );
}

/** Spinner pequeno para uso inline (botões, status). Herda a cor do texto. */
export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return <Loader size={size} stroke={Math.max(2, Math.round(size / 8))} className={className} />;
}

/** Loader de tela cheia (fallback de rota). Centralizado no espaço disponível. */
export function PageLoader({
  label = "Carregando…",
  className = "min-h-[60vh]",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex w-full flex-col items-center justify-center gap-3 ${className}`.trim()}>
      <Loader className="text-brand" />
      <p className="text-sm text-neutral-500">{label}</p>
    </div>
  );
}
