"use client";

import { useEffect } from "react";

/**
 * Último anteparo: erro no próprio RootLayout, antes de qualquer layout da
 * aplicação existir. Por isso precisa trazer <html> e <body> próprios e não
 * pode depender de nada renderizado acima — inclusive do CSS global, que pode
 * não ter sido aplicado. O estilo vai inline de propósito.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erro-global]", error.digest ?? error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "1.5rem",
          textAlign: "center",
          margin: 0,
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
          Algo deu errado
        </h1>
        <p style={{ maxWidth: "20rem", fontSize: "0.875rem", color: "#737373", margin: 0 }}>
          O aplicativo não conseguiu iniciar. Tente recarregar.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: "0.75rem",
            border: "none",
            background: "#16a34a",
            color: "#fff",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
