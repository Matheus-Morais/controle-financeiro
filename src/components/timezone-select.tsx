"use client";

import { useState, useTransition } from "react";
import { Globe } from "lucide-react";
import { Select } from "@/components/select";
import { Spinner } from "@/components/loader";
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
      <Select
        value={tz}
        onChange={(next) => {
          setTz(next);
          startTransition(() => void saveTimezone(next));
        }}
        title="Fuso horário"
        ariaLabel="Fuso horário"
        options={ZONES.map((z) => ({ value: z.tz, label: z.label }))}
      />
      {pending && (
        <p className="flex items-center gap-1 text-xs text-neutral-400">
          <Spinner size={12} /> Salvando…
        </p>
      )}
    </section>
  );
}
