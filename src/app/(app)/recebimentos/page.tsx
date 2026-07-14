import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function RecebimentosPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Recebimentos</h1>
      <PhasePlaceholder title="Registrar entradas do mês" phase="Fase 2 — Renda">
        Salário, freelas e outras entradas; marcar recorrentes para comparar renda × gastos no
        dashboard.
      </PhasePlaceholder>
    </div>
  );
}
