"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Comportamentos que todo bottom sheet precisa ter e que não têm nada a ver com
 * o conteúdo dele. Saíram de `select.tsx` — onde eram 40 linhas de `useEffect`
 * no meio da lógica de gesto — para poderem ser lidos (e reaproveitados pelos
 * outros modais do app) sem carregar junto o dropdown inteiro.
 */

/**
 * Trava a rolagem da página enquanto o sheet está aberto.
 *
 * Sem isso, rolar o sheet até o fim continua rolando o conteúdo atrás dele — e
 * ao fechar o usuário está num ponto da tela que não escolheu.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/**
 * Prende o foco dentro do sheet.
 *
 * Com o backdrop cobrindo a tela, um `Tab` que escapasse levaria o foco para
 * controles invisíveis — quem navega por teclado ficaria digitando num
 * formulário que não vê. `fallback` recebe o foco quando o sheet não tem
 * nenhum elemento focável próprio.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  fallbackRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0] ?? fallbackRef.current;
      const last = focusables[focusables.length - 1] ?? fallbackRef.current;
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    // Na fase de captura: o handler precisa ver o Tab antes de qualquer
    // componente de dentro do sheet consumi-lo.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active, containerRef, fallbackRef]);
}

/**
 * Faz o botão voltar do Android fechar o sheet em vez de sair da tela.
 *
 * Empilha uma entrada de histórico ao abrir; quando o sheet é fechado por
 * qualquer outro caminho (escolha, backdrop, arrasto), essa entrada precisa ser
 * desfeita — é o que a função devolvida faz. Ela é no-op quando quem fechou foi
 * o próprio voltar, porque aí a entrada já saiu e um `history.back()` extra
 * tiraria o usuário da página, com o formulário preenchido.
 *
 * @param close chamado com `true` quando a origem foi o `popstate`.
 * @returns desfaz a entrada de histórico, se ainda houver uma.
 */
export function useBackButtonClose(
  active: boolean,
  close: (fromPopstate?: boolean) => void,
): () => void {
  const pushed = useRef(false);

  useEffect(() => {
    if (!active) return;
    history.pushState({ cfSheet: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      close(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active, close]);

  return useCallback(() => {
    if (!pushed.current) return;
    pushed.current = false;
    history.back();
  }, []);
}
