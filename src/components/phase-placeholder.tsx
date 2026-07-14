import { Construction } from "lucide-react";

/**
 * Placeholder para telas ainda não implementadas, indicando a fase do roadmap.
 * Some conforme cada fase for construída.
 */
export function PhasePlaceholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
      <Construction className="text-brand" size={32} />
      <h2 className="text-lg font-semibold">{title}</h2>
      <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
        {phase}
      </span>
      {children && <p className="max-w-xs text-sm text-neutral-500">{children}</p>}
    </section>
  );
}
