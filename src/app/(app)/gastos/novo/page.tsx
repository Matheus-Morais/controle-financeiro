import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function NovoGastoPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Adicionar gasto</h1>
      <PhasePlaceholder title="Lançar um gasto" phase="Fase 1 — MVP">
        Descrição, valor, cartão ou carteira, categoria e tipo (à vista / parcelado / recorrente).
        As parcelas são geradas automaticamente nas competências corretas.
      </PhasePlaceholder>
    </div>
  );
}
