"use client";

import Link, { useLinkStatus } from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import type { ComponentType } from "react";

type IconComponent = ComponentType<{ size?: number; className?: string }>;

/**
 * Ícone do link que vira spinner enquanto a navegação está pendente. Mesmo
 * padrão das setas do `MonthNav`: sem isso, tocar no voltar não muda nada na
 * tela e a navegação (que pode levar segundos numa rota pesada) parece travada.
 * `useLinkStatus` (Next 15.3+) só funciona num Client Component descendente do
 * `<Link>`, por isso este subcomponente separado.
 */
function PendingIcon({ icon: Icon, size }: { icon: IconComponent; size: number }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return <Loader2 size={size} className="motion-safe:animate-spin" aria-hidden />;
  }
  return <Icon size={size} />;
}

/** Estilo comum dos alvos de toque do cabeçalho: 40px de alvo, feedback ao tocar. */
const HIT_AREA =
  "rounded-lg p-2 text-neutral-500 transition-colors active:bg-neutral-200/70 active:text-brand dark:active:bg-neutral-800";

/**
 * Seta de voltar do cabeçalho das telas internas. O `-ml-2` compensa o padding
 * do alvo de toque, então o título continua alinhado com o resto da tela.
 *
 * @param href para onde volta.
 * @param label rótulo acessível (o destino, quando não é óbvio).
 */
export function BackLink({ href, label = "Voltar" }: { href: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className={`-ml-2 shrink-0 ${HIT_AREA}`}>
      <PendingIcon icon={ChevronLeft} size={24} />
    </Link>
  );
}

/**
 * Ação em ícone no cabeçalho (importar fatura, editar…). O padding dá o alvo de
 * toque de 40px que os ícones soltos não tinham — dois deles lado a lado ficavam
 * a 8px um do outro, o que garantia toque errado no polegar.
 *
 * @param edge `true` no último ícone da linha, para encostar na margem da tela.
 */
export function HeaderIconLink({
  href,
  icon,
  label,
  title,
  size = 20,
  edge = false,
}: {
  href: string;
  icon: IconComponent;
  label: string;
  title?: string;
  size?: number;
  edge?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={title}
      className={`${edge ? "-mr-2 " : ""}shrink-0 ${HIT_AREA}`}
    >
      <PendingIcon icon={icon} size={size} />
    </Link>
  );
}
