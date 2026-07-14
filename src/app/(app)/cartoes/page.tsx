import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function CartoesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Cartões</h1>
      <PhasePlaceholder title="Gerenciar cartões e faturas" phase="Fase 1 — MVP">
        Cadastro de cartões (fechamento/vencimento), visão mensal com abas Parcelado / Recorrente /
        À vista, parcelas restantes e marcar fatura como paga.
      </PhasePlaceholder>
    </div>
  );
}
