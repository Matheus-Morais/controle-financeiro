import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function RecorrentesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Recorrentes</h1>
      <PhasePlaceholder title="Assinaturas e gastos fixos" phase="Fase 2 — Recorrência">
        Cadastre assinaturas (streaming, academia…) que são lançadas automaticamente todo mês.
      </PhasePlaceholder>
    </div>
  );
}
