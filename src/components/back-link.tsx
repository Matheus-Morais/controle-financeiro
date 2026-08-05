"use client";

import Link, { useLinkStatus } from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

type IconComponent = ComponentType<{ size?: number; className?: string }>;

/**
 * Ícone do link que vira spinner enquanto a navegação está pendente. Mesmo
 * padrão das setas do `MonthNav`: sem isso, tocar no voltar não muda nada na
 * tela e a navegação (que pode levar segundos numa rota pesada) parece travada.
 * `useLinkStatus` (Next 15.3+) só funciona num Client Component descendente do
 * `<Link>`, por isso este subcomponente separado.
 *
 * Recebe o COMPONENTE do ícone, o que só é possível porque quem chama é o
 * `BackLink` aqui do lado — dentro do mesmo módulo cliente. Para quem chama de
 * um Server Component existe o `PendingSlot` abaixo.
 */
function PendingIcon({ icon: Icon, size }: { icon: IconComponent; size: number }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return <Loader2 size={size} className="motion-safe:animate-spin" aria-hidden />;
  }
  return <Icon size={size} />;
}

/**
 * Mesma troca por spinner, mas recebendo o ícone JÁ RENDERIZADO.
 *
 * Um componente é uma função, e função não atravessa a fronteira RSC: passar
 * `icon={FileUp}` de um Server Component para cá quebrava a tela do cartão em
 * runtime com "Functions cannot be passed directly to Client Components" — o
 * build não pega, porque a rota é dinâmica e nunca é renderizada na compilação.
 * Um elemento (`<FileUp />`) é serializável e resolve sem perder o spinner.
 */
function PendingSlot({ children, size }: { children: ReactNode; size: number }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return <Loader2 size={size} className="motion-safe:animate-spin" aria-hidden />;
  }
  return <>{children}</>;
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
  children,
  label,
  title,
  size = 20,
  edge = false,
}: {
  href: string;
  /** O ícone JÁ renderizado (ex.: `<FileUp size={20} />`) — ver `PendingSlot`. */
  children: ReactNode;
  label: string;
  title?: string;
  /** Tamanho do spinner que substitui o ícone durante a navegação. */
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
      <PendingSlot size={size}>{children}</PendingSlot>
    </Link>
  );
}
