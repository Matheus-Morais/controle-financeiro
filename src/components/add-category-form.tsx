"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { Spinner } from "@/components/loader";

type ActionState = { error?: string; ok?: boolean } | undefined;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {pending ? <Spinner size={16} /> : <Plus size={16} />} Add
    </button>
  );
}

export function AddCategoryForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          name="name"
          required
          placeholder="Nova categoria"
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <AddButton />
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
