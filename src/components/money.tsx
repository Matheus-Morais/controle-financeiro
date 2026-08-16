import { formatCents } from "@/lib/money";

/**
 * Um valor em dinheiro na tela.
 *
 * Existe para dar um GANCHO único a "ocultar valores": marcado com `data-money`,
 * qualquer valor da aplicação some com uma regra de CSS ligada no `<html>`
 * (ver `globals.css` e `HideValuesToggle`).
 *
 * Deliberadamente SEM `"use client"`: a maior parte dos valores é renderizada em
 * Server Component (dashboard, cartões, contas, orçamento, recebimentos), e um
 * Context React não alcançaria nenhum deles — chegariam ao browser já como texto
 * dentro do payload RSC. Por isso a preferência vive num atributo do documento e
 * não em estado do React.
 *
 * A formatação continua sendo só a de `lib/money.ts`.
 */
export function Money({ cents, className }: { cents: number; className?: string }) {
  return (
    <span data-money className={className}>
      {formatCents(cents)}
    </span>
  );
}
