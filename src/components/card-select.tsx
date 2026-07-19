"use client";

// Cor padrão quando o cartão não tem cor definida — mesmo verde usado como
// fallback nas telas de cartões (cartoes/page.tsx, cartoes/[id]/page.tsx).
const FALLBACK_COLOR = "#16a34a";

export interface CardOption {
  id: string;
  name: string;
  last_four: string | null;
  color: string | null;
}

/** Preto ou branco conforme a luminância da cor de fundo — texto sempre legível. */
function readableText(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "#ffffff";
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#000000" : "#ffffff";
}

function cardLabel(c: CardOption): string {
  return `${c.name}${c.last_four ? ` ••${c.last_four}` : ""}`;
}

/**
 * Select de cartão que reflete a cor escolhida pelo usuário: um swatch da cor do
 * cartão selecionado aparece no campo fechado e cada opção do dropdown recebe a
 * cor do seu cartão. Usado na revisão da importação e no modal de confirmação.
 */
export function CardSelect({
  cards,
  value,
  onChange,
  className,
}: {
  cards: CardOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const selected = cards.find((c) => c.id === value);
  const swatchColor = selected?.color ?? FALLBACK_COLOR;

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full ring-1 ring-black/10 dark:ring-white/25"
        style={{ backgroundColor: swatchColor }}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // paddingLeft inline garante espaço para o swatch sem conflitar com o px-* do className.
        style={{ paddingLeft: "2rem" }}
        className={`w-full ${className ?? ""}`}
      >
        {cards.map((c) => {
          const bg = c.color ?? FALLBACK_COLOR;
          return (
            <option key={c.id} value={c.id} style={{ backgroundColor: bg, color: readableText(bg) }}>
              {cardLabel(c)}
            </option>
          );
        })}
      </select>
    </div>
  );
}
