"use client";

import { ErrorScreen } from "@/components/error-screen";

/**
 * Tela de erro da área logada. Sem ela, uma query que falha (Supabase fora do
 * ar, sessão expirada no meio da renderização) derruba a rota para a tela
 * genérica do Next, em inglês e sem saída. Renderiza dentro do layout, então a
 * bottom-nav continua disponível.
 */
export default function ErroDaArea(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen {...props} scope="app" />;
}
