"use client";

import { Select } from "@/components/select";

// Cor padrão quando o cartão não tem cor definida — mesmo verde usado como
// fallback nas telas de cartões (cartoes/page.tsx, cartoes/[id]/page.tsx).
const FALLBACK_COLOR = "#16a34a";

export interface CardOption {
  id: string;
  name: string;
  last_four: string | null;
  color: string | null;
}

/**
 * Select de cartão que reflete a cor escolhida pelo usuário: a cor do cartão
 * selecionado aparece no campo fechado e cada opção da lista mostra a sua.
 * Usado na revisão da importação e no modal de confirmação.
 *
 * Antes isso era um `<select>` nativo com `style` nas `<option>` — que o iOS
 * ignora por completo. Agora vai pelo `Select` do projeto, que desenha a lista.
 */
export function CardSelect({
  cards,
  value,
  onChange,
}: {
  cards: CardOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={onChange}
      title="Escolha o cartão"
      ariaLabel="Cartão"
      options={cards.map((c) => ({
        value: c.id,
        label: c.name,
        color: c.color ?? FALLBACK_COLOR,
        hint: c.last_four ? `••${c.last_four}` : undefined,
      }))}
    />
  );
}
