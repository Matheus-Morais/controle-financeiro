"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

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
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  function openSheet() {
    const i = options.findIndex((o) => o.value === current);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

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

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div
            aria-hidden
            onClick={close}
            className="absolute inset-0 bg-black/40 motion-safe:animate-fade-in"
          />
          {/* O ring separa o sheet do fundo no escuro, onde o backdrop preto e o
              bg-neutral-900 quase se confundem. */}
          <div className="relative flex max-h-[75svh] flex-col rounded-t-3xl bg-white pb-safe-bottom shadow-2xl ring-1 ring-black/5 motion-safe:animate-sheet-up dark:bg-neutral-900 dark:ring-white/10">
            <div className="shrink-0 px-4 pb-1 pt-3">
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
              role="listbox"
              tabIndex={-1}
              onKeyDown={handleKeyDown}
              aria-label={title ?? ariaLabel}
              aria-activedescendant={`${baseId}-${active}`}
              className="min-h-0 flex-1 overflow-y-auto px-2 pb-5 pt-2 outline-none"
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
                      onClick={() => choose(option.value)}
                      onMouseEnter={() => setActive(i)}
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
        </div>
      )}
    </>
  );
}
