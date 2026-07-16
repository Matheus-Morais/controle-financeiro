"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";

type State = { error?: string; sent?: boolean } | undefined;
type Action = (prev: unknown, formData: FormData) => Promise<State>;

export function ForgotPasswordForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">Recuperar senha</h1>

      {state?.sent ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Se o e-mail existir, enviamos um link para você redefinir a senha. Verifique sua caixa de
          entrada e o spam.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            Informe seu e-mail e enviaremos um link para redefinir a senha.
          </p>

          <label className="flex flex-col gap-1 text-sm">
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>

          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

          <SubmitButton pendingLabel="Aguarde…">Enviar link</SubmitButton>
        </>
      )}

      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="font-medium text-brand">
          Voltar para entrar
        </Link>
      </p>
    </form>
  );
}
