"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export const HIDE_VALUES_KEY = "cf:hide-values";

/**
 * Liga/desliga a exibição dos valores em dinheiro.
 *
 * O estado mora num atributo do `<html>` (`data-hide-values`), lido por CSS. É o
 * que faz a preferência PROPAGAR sozinha para todas as telas: o `<html>` não é
 * remontado nas navegações do App Router, e os valores renderizados no servidor
 * — a maioria — não teriam como ler um Context React.
 *
 * Persistido no `localStorage`, por APARELHO: privacidade de tela é do celular
 * que está na mão, não da conta. Um script inline no RootLayout aplica o mesmo
 * atributo antes da primeira pintura, senão o valor pisca antes de sumir.
 */
export function HideValuesToggle({ className = "" }: { className?: string }) {
  const [hidden, setHidden] = useState(false);

  // O servidor não sabe a preferência (é localStorage), então a primeira
  // renderização assume "visível" e este efeito reconcilia com o que o script
  // inline já aplicou no documento — sem piscar, porque quem pinta é o CSS.
  useEffect(() => {
    setHidden(document.documentElement.dataset.hideValues !== undefined);
  }, []);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    if (next) {
      document.documentElement.dataset.hideValues = "";
      localStorage.setItem(HIDE_VALUES_KEY, "1");
    } else {
      delete document.documentElement.dataset.hideValues;
      localStorage.removeItem(HIDE_VALUES_KEY);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      className={`shrink-0 rounded-lg p-2 text-neutral-500 transition-colors active:bg-neutral-200/70 active:text-brand dark:active:bg-neutral-800 ${className}`}
    >
      {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
    </button>
  );
}
