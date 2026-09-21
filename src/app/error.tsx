"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Erro nas rotas sem `error.tsx` próprio (login, cadastro, onboarding). */
export default function ErroRaiz(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen {...props} scope="raiz" />;
}
