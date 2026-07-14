import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function OrcamentoPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Orçamento</h1>
      <PhasePlaceholder title="Metas de gasto por categoria" phase="Fase 4 — Extras">
        Defina limites mensais por categoria e acompanhe o progresso com gráficos.
      </PhasePlaceholder>
    </div>
  );
}
