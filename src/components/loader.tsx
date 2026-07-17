import type { CSSProperties } from "react";

const ANIMATIONS = `
@keyframes cf-hatch-v {
  0%,15%  { transform: scaleY(1) }
  50%     { transform: scaleY(0.15) }
  85%,100%{ transform: scaleY(1) }
}
@keyframes cf-hatch-h {
  0%,15%  { transform: scaleY(1) }
  50%     { transform: scaleY(0.15) }
  85%,100%{ transform: scaleY(1) }
}
@keyframes cf-hatch-ring {
  0%   { transform: rotate(0deg) }
  100% { transform: rotate(360deg) }
}
@keyframes cf-wave-bar {
  0%,100% { transform: scaleY(0.15) }
  50%     { transform: scaleY(1) }
}
`;

/* ─── Hatch #15 (uiball.com / ldrs) ─────────────────────────────────────────
   Dois retângulos cruzados que colidem e se expandem num aro giratório.
   Uso geral na aplicação. */
export function HatchLoader({
  size = 40,
  color = "currentColor",
  speed = 1.7,
  className = "",
  style,
}: {
  size?: number;
  color?: string;
  speed?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const bar = size * 0.18;
  const half = size / 2;
  const dur = `${speed}s`;

  return (
    <>
      <style>{ANIMATIONS}</style>
      <div
        role="status"
        aria-label="Carregando"
        className={className}
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `${Math.max(2, Math.round(bar * 0.6))}px solid`,
            borderColor: color,
            opacity: 0.18,
            animation: `cf-hatch-ring ${dur} linear infinite`,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: bar,
            height: size * 0.7,
            left: half - bar / 2,
            top: size * 0.15,
            background: color,
            borderRadius: bar,
            transformOrigin: "center",
            animation: `cf-hatch-v ${dur} ease-in-out infinite`,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: size * 0.7,
            height: bar,
            top: half - bar / 2,
            left: size * 0.15,
            background: color,
            borderRadius: bar,
            transformOrigin: "center",
            animation: `cf-hatch-h ${dur} ease-in-out infinite`,
            animationDelay: `${speed / 2}s`,
          }}
        />
      </div>
    </>
  );
}

/* ─── Waveform #14 (uiball.com / ldrs) ──────────────────────────────────────
   Cinco barras verticais que oscilam como equalizador de áudio.
   Usado enquanto a IA analisa a fatura. */
export function WaveformLoader({
  size = 40,
  color = "currentColor",
  speed = 1,
  bars = 5,
  className = "",
  style,
}: {
  size?: number;
  color?: string;
  speed?: number;
  bars?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const gap = size * 0.06;
  const barW = (size - gap * (bars - 1)) / bars;
  const dur = `${speed}s`;

  return (
    <>
      <style>{ANIMATIONS}</style>
      <div
        role="status"
        aria-label="Analisando"
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          gap,
          height: size,
          ...style,
        }}
      >
        {Array.from({ length: bars }, (_, i) => (
          <div
            key={i}
            style={{
              width: barW,
              height: size,
              background: color,
              borderRadius: barW / 2,
              transformOrigin: "center",
              animation: `cf-wave-bar ${dur} ease-in-out infinite`,
              animationDelay: `${(i / bars) * speed}s`,
            }}
          />
        ))}
      </div>
    </>
  );
}

/* ─── Legado: ring spinner + Spinner inline ──────────────────────────────────
   Mantidos para botões e status que os importam. */
type LoaderProps = {
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
};

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
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="opacity-20"
      />
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

export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return <Loader size={size} stroke={Math.max(2, Math.round(size / 8))} className={className} />;
}

/* ─── PageLoader ─────────────────────────────────────────────────────────────
   Fallback de rota (Suspense). Centralizado em todo o espaço disponível da tela,
   descontando bottom-nav (pb-28) e paddings do layout. */
export function PageLoader({
  label = "Carregando…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-4 ${className}`.trim()}
      style={{ minHeight: "calc(100svh - 10rem)" }}
    >
      <HatchLoader size={48} color="var(--color-brand, #6366f1)" />
      <p className="text-sm text-neutral-500">{label}</p>
    </div>
  );
}
