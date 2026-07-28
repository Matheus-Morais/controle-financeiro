"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { WaveformLoader } from "@/components/loader";

/**
 * Etapas exibidas durante a leitura do PDF. Os tempos são INDICATIVOS: a rota de
 * extração devolve tudo de uma vez (não há progresso real para acompanhar), mas
 * uma espera de até um minuto com um texto estático parece travamento. As etapas
 * descrevem o que de fato acontece no servidor, na ordem em que acontece.
 */
const STEPS: { label: string; startsAtMs: number }[] = [
  { label: "Enviando o PDF", startsAtMs: 0 },
  { label: "Lendo os lançamentos", startsAtMs: 3_500 },
  { label: "Organizando e categorizando", startsAtMs: 14_000 },
];

/**
 * Overlay de tela cheia enquanto a IA lê a fatura. Cobre o viewport inteiro
 * (inclusive a bottom-nav, que é `z-40`) e trava o scroll: a versão anterior era
 * `absolute` dentro do formulário, então cobria só uns 300px e deixava o resto
 * da tela visível e clicável — dava para sair no meio da análise.
 */
export function AnalyzingInvoiceOverlay() {
  const [current, setCurrent] = useState(0);

  // Avança as etapas. Os timers são agendados uma única vez (STEPS é constante
  // de módulo) e limpos se a análise terminar antes.
  useEffect(() => {
    const timers = STEPS.slice(1).map((s, i) =>
      setTimeout(() => setCurrent(i + 1), s.startsAtMs),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Trava o scroll do body enquanto o overlay está aberto.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-neutral-50/90 px-8 backdrop-blur-md dark:bg-neutral-950/90"
    >
      {/* aria-hidden: o próprio contêiner já anuncia o estado; o loader traz um
          role="status" interno que duplicaria o anúncio. */}
      <div aria-hidden>
        <WaveformLoader size={48} color="var(--color-brand)" speed={0.9} />
      </div>

      <p className="text-base font-semibold">Analisando sua fatura</p>

      <ul className="flex w-full max-w-[15rem] flex-col gap-2.5">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={step.label}
              className={`flex items-center gap-2.5 text-sm transition-colors ${
                done
                  ? "text-neutral-400"
                  : active
                    ? "font-medium text-neutral-800 dark:text-neutral-100"
                    : "text-neutral-300 dark:text-neutral-600"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <Check size={16} className="text-brand" />
                ) : active ? (
                  <Loader2 size={16} className="text-brand motion-safe:animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              {step.label}
            </li>
          );
        })}
      </ul>

      <p className="max-w-[17rem] text-center text-xs text-neutral-400">
        Pode levar até um minuto. Mantenha esta tela aberta.
      </p>
    </div>
  );
}
