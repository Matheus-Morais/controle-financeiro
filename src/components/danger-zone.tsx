"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { RotateCcw, Trash2 } from "lucide-react";
import { Spinner } from "@/components/loader";
import { resetAccountData, deleteAccount } from "@/app/(app)/config/actions";

type State = { error?: string } | undefined;
type Action = (prev: unknown, formData: FormData) => Promise<State>;

function ConfirmSubmitButton({
  label,
  pendingLabel,
  matches,
}: {
  label: string;
  pendingLabel: string;
  matches: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !matches}
      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-semibold text-white disabled:opacity-60"
    >
      {pending && <Spinner size={18} />}
      {pending ? pendingLabel : label}
    </button>
  );
}

function ConfirmActionModal({
  title,
  description,
  bullets,
  confirmPhrase,
  action,
  confirmLabel,
  pendingLabel,
  onCancel,
}: {
  title: string;
  description: string;
  bullets: string[];
  confirmPhrase: string;
  action: Action;
  confirmLabel: string;
  pendingLabel: string;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [text, setText] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-neutral-900">
        <form action={formAction} className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-red-600">{title}</h2>
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          </div>

          <ul className="list-inside list-disc text-sm text-neutral-500">
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          <label className="flex flex-col gap-1 text-sm">
            Digite <span className="font-mono font-semibold">{confirmPhrase}</span> para confirmar
            <input
              name="confirmation"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>

          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold dark:border-neutral-700"
            >
              Cancelar
            </button>
            <ConfirmSubmitButton
              label={confirmLabel}
              pendingLabel={pendingLabel}
              matches={text.trim() === confirmPhrase}
            />
          </div>
        </form>
      </div>
    </div>
  );
}

/** Zona de risco em Ajustes: reiniciar a conta (soft reset) ou excluí-la de vez. */
export function AccountDangerZone() {
  const [open, setOpen] = useState<"reset" | "delete" | null>(null);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/60 dark:bg-neutral-900">
      <p className="text-sm font-semibold text-red-600">Zona de risco</p>

      <button
        type="button"
        onClick={() => setOpen("reset")}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-3 font-medium text-red-600 dark:border-red-900"
      >
        <RotateCcw size={18} />
        Reiniciar conta
      </button>
      <p className="text-xs text-neutral-500">
        Apaga cartões, gastos, recebimentos, orçamentos e configs — mantém seu login, como se fosse
        uma conta nova.
      </p>

      <button
        type="button"
        onClick={() => setOpen("delete")}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-3 font-medium text-red-600 dark:border-red-900"
      >
        <Trash2 size={18} />
        Excluir conta
      </button>
      <p className="text-xs text-neutral-500">
        Remove seu login e todos os dados permanentemente. Não é possível desfazer.
      </p>

      {open === "reset" && (
        <ConfirmActionModal
          title="Reiniciar conta"
          description="Isso vai apagar todos os seus registros e configs, mantendo o login atual."
          bullets={[
            "Cartões, gastos, parcelas e faturas",
            "Recebimentos, recorrentes e orçamentos",
            "Notificações e lembretes configurados",
            "Categorias e carteira voltam ao padrão",
          ]}
          confirmPhrase="REINICIAR CONTA"
          action={resetAccountData}
          confirmLabel="Reiniciar conta"
          pendingLabel="Reiniciando…"
          onCancel={() => setOpen(null)}
        />
      )}

      {open === "delete" && (
        <ConfirmActionModal
          title="Excluir conta"
          description="Isso vai remover seu login e apagar todos os seus dados permanentemente. Não tem volta."
          bullets={[
            "Seu e-mail e acesso ao app",
            "Todos os registros financeiros e configs",
            "Dispositivos com notificações ativadas",
          ]}
          confirmPhrase="EXCLUIR CONTA"
          action={deleteAccount}
          confirmLabel="Excluir conta"
          pendingLabel="Excluindo…"
          onCancel={() => setOpen(null)}
        />
      )}
    </section>
  );
}
