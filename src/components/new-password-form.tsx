"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

type State = { error?: string } | undefined;
type Action = (prev: unknown, formData: FormData) => Promise<State>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "Aguarde…" : "Salvar nova senha"}
    </button>
  );
}

export function NewPasswordForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">Nova senha</h1>

      <label className="flex flex-col gap-1 text-sm">
        Nova senha
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Confirmar nova senha
        <input
          name="confirm"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}
