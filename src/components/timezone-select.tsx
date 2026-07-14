"use client";

import { useState, useTransition } from "react";
import { Globe } from "lucide-react";
import { saveTimezone } from "@/app/(app)/config/actions";

const ZONES = [
  { tz: "America/Sao_Paulo", label: "Brasília (São Paulo)" },
  { tz: "America/Fortaleza", label: "Fortaleza / Nordeste" },
  { tz: "America/Manaus", label: "Manaus (Amazonas)" },
  { tz: "America/Cuiaba", label: "Cuiabá (Mato Grosso)" },
  { tz: "America/Rio_Branco", label: "Rio Branco (Acre)" },
  { tz: "America/Noronha", label: "Fernando de Noronha" },
];

export function TimezoneSelect({ initial }: { initial: string }) {
  const [tz, setTz] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <Globe className="text-brand" size={18} />
        <h2 className="font-semibold">Fuso horário</h2>
      </div>
      <p className="text-xs text-neutral-500">Define o horário dos lembretes.</p>
      <select
        value={tz}
        onChange={(e) => {
          setTz(e.target.value);
          startTransition(() => void saveTimezone(e.target.value));
        }}
        className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      >
        {ZONES.map((z) => (
          <option key={z.tz} value={z.tz}>
            {z.label}
          </option>
        ))}
      </select>
      {pending && <p className="text-xs text-neutral-400">Salvando…</p>}
    </section>
  );
}
