"use client";

import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

/**
 * Quanto o dedo pode andar entre o toque e o soltar para ainda contar como
 * escolha, e não como rolagem. Abaixo disso é toque; acima, o gesto era scroll.
 */
const TAP_SLOP_PX = 10;

/**
 * Arrasto vertical na alça que fecha o sheet — o gesto que todo bottom sheet
 * nativo tem e que o polegar tenta por reflexo.
 */
const DISMISS_DRAG_PX = 90;

/** Janela em que o `click` sintético do iOS é ignorado depois de fechar. */
const GHOST_CLICK_MS = 250;

export interface SelectOption {
  value: string;
  label: string;
  /**
   * Cabeçalho do grupo ao qual a opção pertence (ex.: "Cartões"). Opções do
   * mesmo grupo precisam vir juntas na lista — o cabeçalho é emitido quando o
   * grupo muda em relação à opção anterior.
   */
  group?: string;
  /** Bolinha colorida à esquerda do rótulo (ex.: a cor do cartão). */
  color?: string | null;
  /** Texto secundário, à direita do rótulo (ex.: "••1234"). */
  hint?: string;
}

/**
 * Gatilho fechado. Sem largura: como quase todo uso é dentro de um
 * `flex flex-col`, o botão já estica sozinho; onde não deve esticar, o chamador
 * passa `w-fit` no `className` (mesmo comportamento do `<select>` que havia ali).
 */
const TRIGGER_SIZE = {
  md: "gap-2 rounded-xl px-3 py-3 text-sm",
  sm: "gap-1.5 rounded-lg px-2.5 py-1.5 text-xs",
} as const;

/**
 * Dropdown do projeto: gatilho estilizado + bottom sheet.
 *
 * Substitui o `<select>` nativo, que era inconsistente entre navegadores e não
 * permitia cor/ícone por opção — no iOS o `style` das `<option>` é ignorado, e
 * era justamente ali que o seletor de cartão mostrava a cor de cada cartão.
 *
 * A INTERAÇÃO é desenhada para o polegar:
 *
 * - A escolha só é comitada no `pointerup`, sobre a mesma opção do `pointerdown`
 *   e com o dedo tendo andado menos que `TAP_SLOP_PX`. A versão anterior escolhia
 *   no `pointerdown` e ainda chamava `preventDefault()` ali, o que ANULAVA a
 *   rolagem: era impossível percorrer uma lista longa sem selecionar algo, e não
 *   havia como desistir arrastando o dedo para fora.
 * - Arrastar a alça para baixo fecha; o botão voltar do Android fecha o sheet em
 *   vez de sair da tela.
 *
 * Em formulário, passe `name`: o valor vai num input escondido, então as Server
 * Actions continuam lendo o `FormData` como antes. Funciona controlado
 * (`value` + `onChange`) ou não controlado (`defaultValue`).
 */
export function Select({
  options,
  value,
  defaultValue,
  onChange,
  name,
  title,
  placeholder = "Selecionar",
  disabled = false,
  size = "md",
  className = "",
  ariaLabel,
}: {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Nome do campo no formulário; gera o input escondido com o valor. */
  name?: string;
  /** Título do bottom sheet. */
  title?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: keyof typeof TRIGGER_SIZE;
  className?: string;
  ariaLabel?: string;
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = controlled ? value : internal;
  const selected = options.find((o) => o.value === current);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);
  /** Deslocamento vertical do arrasto de fechar, em px. */
  const [dragY, setDragY] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /** Toque em andamento sobre uma opção: id do ponteiro, origem e alvo. */
  const tapRef = useRef<{ pointerId: number; x: number; y: number; value: string } | null>(null);
  /** Arrasto da alça em andamento. */
  const dragRef = useRef<{ pointerId: number; y: number } | null>(null);
  /** Instante do fechamento, para descartar o `click` fantasma do iOS. */
  const closedAtRef = useRef(0);
  /** O sheet empurrou uma entrada no histórico (para o voltar fechá-lo). */
  const pushedHistoryRef = useRef(false);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  useEffect(() => setMounted(true), []);

  function openSheet() {
    // O `click` que o iOS sintetiza depois do `pointerup` chegaria ao gatilho
    // logo após uma escolha e reabriria o sheet.
    if (Date.now() - closedAtRef.current < GHOST_CLICK_MS) return;
    const i = options.findIndex((o) => o.value === current);
    setActive(i >= 0 ? i : 0);
    setDragY(0);
    setOpen(true);
  }

  /**
   * `fromPopstate` distingue quem fechou: no voltar do Android a entrada de
   * histórico já saiu, e chamar `history.back()` de novo sairia da tela.
   */
  const close = useCallback((fromPopstate = false) => {
    setOpen(false);
    setDragY(0);
    tapRef.current = null;
    dragRef.current = null;
    closedAtRef.current = Date.now();
    if (pushedHistoryRef.current && !fromPopstate) {
      pushedHistoryRef.current = false;
      history.back();
    }
    if (fromPopstate) pushedHistoryRef.current = false;
    // No touch, focar o gatilho pode reativá-lo com o dedo ainda levantando.
    if (window.matchMedia("(pointer: fine)").matches) {
      triggerRef.current?.focus();
    }
  }, []);

  function choose(v: string) {
    if (!controlled) setInternal(v);
    onChange?.(v);
    close();
  }

  // Foco no listbox ao abrir, para o teclado funcionar sem um clique extra.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // Mantém a opção ativa visível ao navegar pelo teclado.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Trava o scroll do body enquanto o sheet está aberto.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /**
   * Voltar do Android fecha o sheet em vez de navegar. Sem isto, o gesto mais
   * instintivo para "sair daqui" tirava o usuário da tela inteira, com o
   * formulário preenchido.
   */
  useEffect(() => {
    if (!open) return;
    history.pushState({ cfSheet: true }, "");
    pushedHistoryRef.current = true;
    const onPop = () => close(true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, close]);

  /**
   * Foco preso no sheet enquanto ele está aberto: com o backdrop cobrindo a
   * tela, um `Tab` que escapasse levaria o foco para controles invisíveis.
   */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = sheet.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0] ?? listRef.current;
      const last = focusables[focusables.length - 1] ?? listRef.current;
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    const last = options.length - 1;
    switch (e.key) {
      case "Escape":
        close();
        break;
      case "ArrowDown":
        setActive((i) => Math.min(i + 1, last));
        break;
      case "ArrowUp":
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        setActive(0);
        break;
      case "End":
        setActive(last);
        break;
      case "Enter":
      case " ": {
        const option = options[active];
        if (option) choose(option.value);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  }

  // ── Toque numa opção: arma no down, decide no up ──────────────────────────
  function onOptionPointerDown(e: React.PointerEvent, option: SelectOption, i: number) {
    // Sem `preventDefault`: é ele que mataria a rolagem da lista.
    tapRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, value: option.value };
    setActive(i);
  }

  function onOptionPointerUp(e: React.PointerEvent, option: SelectOption) {
    const tap = tapRef.current;
    tapRef.current = null;
    if (!tap || tap.pointerId !== e.pointerId || tap.value !== option.value) return;
    // Dedo que andou é rolagem (ou desistência), não escolha.
    if (Math.abs(e.clientX - tap.x) > TAP_SLOP_PX || Math.abs(e.clientY - tap.y) > TAP_SLOP_PX) {
      return;
    }
    choose(option.value);
  }

  // ── Arrasto da alça para fechar ───────────────────────────────────────────
  function onHandlePointerDown(e: React.PointerEvent) {
    dragRef.current = { pointerId: e.pointerId, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    // Só para baixo: arrastar para cima não estica o sheet.
    setDragY(Math.max(0, e.clientY - drag.y));
  }

  function onHandlePointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.clientY - drag.y > DISMISS_DRAG_PX) close();
    else setDragY(0);
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}

      <button
        type="button"
        ref={triggerRef}
        onClick={openSheet}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        className={`flex items-center border border-neutral-300 bg-white text-left transition active:scale-[0.99] disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 ${TRIGGER_SIZE[size]} ${className}`}
      >
        {selected?.color != null && (
          <span
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/25"
            style={{ backgroundColor: selected.color }}
          />
        )}
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-neutral-400"}`}>
          {selected?.label ?? placeholder}
        </span>
        {selected?.hint && (
          <span className="shrink-0 text-xs text-neutral-400">{selected.hint}</span>
        )}
        <ChevronDown size={size === "sm" ? 14 : 16} className="shrink-0 text-neutral-400" />
      </button>

      {open &&
        mounted &&
        createPortal(
          // Portal no body: fora de <label> (cujo clique reativaria o gatilho) e
          // sem herdar stacking context de quem chamou.
          <div className="fixed inset-0 z-[60] flex flex-col justify-end">
            <div
              aria-hidden
              // Fecha no `pointerup`: no `pointerdown` o sheet sumia no meio de
              // um arrasto que apenas ESCAPOU da lista.
              onPointerUp={() => close()}
              className="absolute inset-0 bg-black/40 motion-safe:animate-fade-in"
            />
            {/* O ring separa o sheet do fundo no escuro, onde o backdrop preto e o
                bg-neutral-900 quase se confundem. */}
            <div
              ref={sheetRef}
              className="relative flex max-h-[75svh] flex-col rounded-t-3xl bg-white pb-safe-bottom shadow-2xl ring-1 ring-black/5 motion-safe:animate-sheet-up dark:bg-neutral-900 dark:ring-white/10"
              style={
                dragY > 0
                  ? { transform: `translateY(${dragY}px)`, transition: "none" }
                  : { transition: "transform 150ms ease-out" }
              }
            >
              <div
                className="shrink-0 touch-none px-4 pb-1 pt-3"
                onPointerDown={onHandlePointerDown}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
              >
                <div
                  aria-hidden
                  className="mx-auto h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700"
                />
                {title && <p className="mt-3 text-center text-sm font-semibold">{title}</p>}
              </div>

              {/* O próprio listbox recebe o foco: `aria-activedescendant` só é
                  seguido pelos leitores de tela no elemento focado. */}
              <div
                ref={listRef}
                id={listboxId}
                role="listbox"
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                aria-label={title ?? ariaLabel}
                aria-activedescendant={`${baseId}-${active}`}
                // `touch-pan-y` libera a rolagem vertical; `overscroll-contain`
                // impede que o fim da lista role a página atrás do sheet.
                className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-2 pb-5 pt-2 outline-none"
              >
                {options.map((option, i) => {
                  const isSelected = option.value === current;
                  const startsGroup = option.group && option.group !== options[i - 1]?.group;
                  return (
                    <Fragment key={option.value}>
                      {startsGroup && (
                        <div
                          role="presentation"
                          className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
                        >
                          {option.group}
                        </div>
                      )}
                      <div
                        id={`${baseId}-${i}`}
                        role="option"
                        aria-selected={isSelected}
                        data-active={i === active}
                        onPointerDown={(e) => onOptionPointerDown(e, option, i)}
                        onPointerUp={(e) => onOptionPointerUp(e, option)}
                        onPointerCancel={() => {
                          tapRef.current = null;
                        }}
                        // Só no mouse: no toque, o "enter" sintético mexeria no
                        // destaque de uma opção que o dedo apenas atravessou.
                        onPointerEnter={(e) => {
                          if (e.pointerType === "mouse") setActive(i);
                        }}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm ${
                          i === active ? "bg-neutral-100 dark:bg-neutral-800" : ""
                        }`}
                      >
                        {option.color != null && (
                          <span
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/25"
                            style={{ backgroundColor: option.color }}
                          />
                        )}
                        <span className={`min-w-0 flex-1 truncate ${isSelected ? "font-medium" : ""}`}>
                          {option.label}
                        </span>
                        {option.hint && (
                          <span className="shrink-0 text-xs text-neutral-400">{option.hint}</span>
                        )}
                        {isSelected && <Check size={16} className="shrink-0 text-brand" />}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
