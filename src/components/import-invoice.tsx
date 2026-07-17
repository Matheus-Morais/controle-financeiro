"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner, WaveformLoader } from "@/components/loader";
import { formatCents, parseBRLToCents } from "@/lib/money";
import {
  dedupeKey,
  isImportable,
  matchCategoryByName,
  reconcile,
  stripInstallmentSuffix,
  type ExtractedInvoice,
  type ExtractedTipo,
} from "@/lib/invoice-import";
import { getExistingInvoiceKeys, importarGastosDaFatura } from "@/app/(app)/gastos/importar/actions";
import { ConfirmCardModal } from "@/components/confirm-card-modal";

const MAX_BYTES = 4 * 1024 * 1024;

interface Card {
  id: string;
  name: string;
  last_four: string | null;
}
interface Category {
  id: string;
  name: string;
}

interface EditableItem {
  id: string;
  statementDescription: string; // nome bruto da fatura (imutável, usado na dedupe)
  description: string; // nome amigável (editável, sem o token de parcela)
  valorBrl: string; // editável
  purchaseDate: string; // YYYY-MM-DD, editável
  categoryId: string; // "" ou uuid
  tipo: ExtractedTipo;
  parcela: { atual: number; total: number } | null; // parcela lida da fatura
  importable: boolean;
  include: boolean;
  duplicate: boolean;
  suggestedRecurring: boolean; // IA sinalizou como provável recorrente
  markAsRecurring: boolean; // usuário quer criar como recorrente
}

const TIPO_LABEL: Record<ExtractedTipo, string> = {
  compra: "Compra",
  credito: "Crédito/estorno",
  encargo: "Encargo",
  pagamento: "Pagamento",
  outro: "Outro",
};

function toEditableItems(inv: ExtractedInvoice, categories: Category[]): EditableItem[] {
  return inv.itens.map((it, i) => ({
    id: `it-${i}`,
    statementDescription: it.descricao,
    description: stripInstallmentSuffix(it.descricao, it.parcela),
    valorBrl: it.valor_brl,
    purchaseDate: it.data,
    categoryId: matchCategoryByName(it.categoria_sugerida, categories) ?? "",
    tipo: it.tipo,
    parcela: it.parcela,
    importable: isImportable(it.tipo),
    include: isImportable(it.tipo),
    duplicate: false,
    suggestedRecurring: it.sugerido_recorrente,
    markAsRecurring: false,
  }));
}

const inputClass =
  "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function ImportInvoice({
  cards,
  categories,
  currentMonth,
}: {
  cards: Card[];
  categories: Category[];
  currentMonth: string; // YYYY-MM-01
}) {
  const [phase, setPhase] = useState<"upload" | "review">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [cardsList, setCardsList] = useState<Card[]>(cards);
  const [cardId, setCardId] = useState("");
  const [referenceMonth, setReferenceMonth] = useState(currentMonth);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());

  // Cartão veio de um match confiável (últimos 4 dígitos do PDF) ou de um
  // fallback (nenhum cartão bateu, caiu no primeiro da lista)? No segundo caso
  // exigimos confirmação antes de gravar — é onde o usuário costuma esquecer
  // de trocar o cartão errado. Trocar manualmente também conta como confiável.
  const [cardConfident, setCardConfident] = useState(false);
  const [detectedDigits, setDetectedDigits] = useState<string | null>(null);
  const [showCardConfirm, setShowCardConfirm] = useState(false);

  const [saveState, saveAction, saving] = useActionState(importarGastosDaFatura, undefined);
  const [navigating, setNavigating] = useState(false);
  const router = useRouter();
  const navigated = useRef(false);

  // Navegação client-side após gravar. A Server Action RETORNA `{ ok }` em vez de
  // redirecionar: assim o `saving` (pending) resolve na hora e o spinner some,
  // evitando o "roda infinito" (o redirect no servidor prendia a transição).
  useEffect(() => {
    if (saveState?.ok && !navigated.current) {
      navigated.current = true;
      setNavigating(true);
      router.replace(`/cartoes/${saveState.cardId}?mes=${saveState.referenceMonth}`);
      // Fallback: se a navegação travar por 10s, devolve o controle ao usuário.
      const t = setTimeout(() => setNavigating(false), 10_000);
      return () => clearTimeout(t);
    }
  }, [saveState, router]);

  // Busca as chaves já importadas quando muda cartão/competência.
  useEffect(() => {
    if (phase !== "review" || !cardId || !referenceMonth) return;
    let active = true;
    getExistingInvoiceKeys(cardId, referenceMonth)
      .then((keys) => active && setExistingKeys(new Set(keys)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [phase, cardId, referenceMonth]);

  // Marca duplicatas e desmarca por padrão (mantém a escolha manual nos demais).
  useEffect(() => {
    setItems((prev) =>
      prev.map((it) => {
        if (!it.importable) return it;
        const dup = existingKeys.has(
          dedupeKey(it.statementDescription, parseBRLToCents(it.valorBrl) ?? 0, it.purchaseDate),
        );
        return { ...it, duplicate: dup, include: dup ? false : it.include };
      }),
    );
  }, [existingKeys]);

  const updateItem = (id: string, patch: Partial<EditableItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setUploadError("PDF muito grande (máx. 4 MB).");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/faturas/importar", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json?.error ?? "Falha ao ler a fatura.");
        return;
      }
      const inv = json as ExtractedInvoice;
      setExtracted(inv);
      setItems(toEditableItems(inv, categories));

      // Cartão: casa pelos últimos 4 dígitos, senão o primeiro (fallback, exige confirmação).
      const digits = inv.ult4_digitos?.replace(/\D/g, "").slice(-4) || null;
      const matched = digits ? cardsList.find((c) => c.last_four === digits) : undefined;
      setCardId(matched?.id ?? cardsList[0]?.id ?? "");
      setCardConfident(!!matched);
      setDetectedDigits(digits);

      // Competência: da sugestão (YYYY-MM), senão o mês corrente.
      const sug = inv.competencia_sugerida;
      setReferenceMonth(sug && /^\d{4}-\d{2}$/.test(sug) ? `${sug}-01` : currentMonth);

      setPhase("review");
    } catch {
      setUploadError("Falha de conexão. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  const totalCents = useMemo(
    () => parseBRLToCents(extracted?.total_fatura ?? ""),
    [extracted],
  );
  // Reconciliação: soma apenas compras/encargos/outros e estornos (sinal negativo).
  // Pagamentos de fatura anterior são excluídos — o total_fatura impresso não os inclui.
  const signedSum = useMemo(
    () =>
      items.reduce((s, it) => {
        if (it.tipo === "pagamento") return s;
        const c = parseBRLToCents(it.valorBrl) ?? 0;
        return s + (it.tipo === "credito" ? -c : c);
      }, 0),
    [items],
  );
  const rec = useMemo(() => reconcile(signedSum, totalCents), [signedSum, totalCents]);

  const included = items.filter((it) => it.importable && it.include);
  const includedSum = included.reduce((s, it) => s + (parseBRLToCents(it.valorBrl) ?? 0), 0);
  const hasInvalid = included.some((it) => (parseBRLToCents(it.valorBrl) ?? 0) <= 0);
  const skipped = items.filter((it) => !it.importable || it.duplicate).length;

  function handleSave() {
    if (!cardId || included.length === 0 || hasInvalid) return;
    if (!cardConfident) {
      setShowCardConfirm(true);
      return;
    }
    doSave();
  }

  function doSave() {
    saveAction({
      card_id: cardId,
      reference_month: referenceMonth,
      items: included.map((it) => ({
        description: it.description,
        statement_description: it.statementDescription,
        valor_brl: it.valorBrl,
        purchase_date: it.purchaseDate,
        category_id: it.categoryId || "",
        parcela: it.parcela,
        mark_as_recurring: it.markAsRecurring,
      })),
    });
  }

  // ── Fase 1: upload ──────────────────────────────────────────────────────
  if (phase === "upload") {
    return (
      <form onSubmit={handleUpload} className="relative flex flex-col gap-4">
        {/* overlay de análise da IA */}
        {uploading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950">
            <WaveformLoader size={48} color="var(--color-brand, #6366f1)" speed={0.9} />
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Analisando sua fatura…
            </p>
          </div>
        )}
        <p className="text-sm text-neutral-500">
          Envie o PDF da fatura do cartão. Os lançamentos são lidos por IA e você revisa tudo antes
          de salvar.
        </p>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setUploadError(null);
          }}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-brand dark:border-neutral-700 dark:bg-neutral-900"
        />
        <p className="text-xs text-neutral-400">
          O PDF é enviado ao serviço de IA (Anthropic) só para leitura e não é armazenado.
        </p>
        {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
        <button
          type="submit"
          disabled={!file || uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          Ler fatura
        </button>
      </form>
    );
  }

  // ── Fase 2: revisão ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Cartão
          <select
            value={cardId}
            onChange={(e) => {
              setCardId(e.target.value);
              setCardConfident(true);
            }}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {cardsList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.last_four ? ` ••${c.last_four}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Competência
          <input
            type="month"
            value={referenceMonth.slice(0, 7)}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d{4}-\d{2}$/.test(v)) setReferenceMonth(`${v}-01`);
            }}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      </div>

      {rec.hasTotal && !rec.ok && (
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          A soma dos lançamentos ({formatCents(signedSum)}) não bate com o total da fatura (
          {formatCents(totalCents ?? 0)}). Diferença de {formatCents(Math.abs(rec.deltaCents))} —
          confira se algum item ficou faltando ou com valor errado.
        </p>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">
          {included.length} incluído(s)
          {skipped > 0 && ` · ${skipped} pulado(s)`}
        </span>
        <span className="font-semibold">{formatCents(includedSum)}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const cents = parseBRLToCents(it.valorBrl);
          const invalid = it.importable && it.include && (cents == null || cents <= 0);
          return (
            <li
              key={it.id}
              className={`rounded-xl border p-3 ${
                it.importable && it.include
                  ? "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                  : "border-neutral-200 bg-neutral-100 opacity-70 dark:border-neutral-800 dark:bg-neutral-900/40"
              }`}
            >
              <div className="flex items-start gap-2">
                {it.importable ? (
                  <input
                    type="checkbox"
                    checked={it.include}
                    onChange={(e) => updateItem(it.id, { include: e.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand"
                  />
                ) : (
                  <span className="mt-0.5 shrink-0 rounded bg-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                    {TIPO_LABEL[it.tipo]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <input
                    value={it.description}
                    onChange={(e) => updateItem(it.id, { description: e.target.value })}
                    disabled={!it.importable}
                    className={`w-full ${inputClass}`}
                    placeholder="Nome do gasto"
                  />
                  {it.parcela && (
                    <span className="mt-1 inline-block rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand">
                      Parcela {it.parcela.atual}/{it.parcela.total}
                    </span>
                  )}
                  <p className="mt-0.5 truncate text-[11px] text-neutral-400">
                    {it.statementDescription}
                    {it.duplicate && " · já importado"}
                  </p>

                  {it.suggestedRecurring && it.importable && (
                    <button
                      type="button"
                      onClick={() => updateItem(it.id, { markAsRecurring: !it.markAsRecurring })}
                      className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition ${
                        it.markAsRecurring
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      }`}
                    >
                      {it.markAsRecurring ? "✓ Recorrente" : "↻ Recorrente?"}
                    </button>
                  )}
                  {it.importable && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        inputMode="decimal"
                        value={it.valorBrl}
                        onChange={(e) => updateItem(it.id, { valorBrl: e.target.value })}
                        placeholder="0,00"
                        className={`${inputClass} ${invalid ? "border-red-400" : ""}`}
                      />
                      <input
                        type="date"
                        value={it.purchaseDate}
                        onChange={(e) => updateItem(it.id, { purchaseDate: e.target.value })}
                        className={inputClass}
                      />
                      <select
                        value={it.categoryId}
                        onChange={(e) => updateItem(it.id, { categoryId: e.target.value })}
                        className={`col-span-2 ${inputClass}`}
                      >
                        <option value="">Sem categoria</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {hasInvalid && (
        <p className="text-sm text-red-600">Há itens incluídos com valor inválido.</p>
      )}
      {saveState?.error && <p className="text-sm text-red-600">{saveState.error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || navigating || saveState?.ok || included.length === 0 || !cardId || hasInvalid}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {(saving || navigating) && <Spinner size={18} />}
        {saving
          ? "Salvando…"
          : navigating
            ? "Redirecionando…"
            : `Importar ${included.length} lançamento${included.length === 1 ? "" : "s"}`}
      </button>

      {showCardConfirm && (
        <ConfirmCardModal
          cards={cardsList}
          cardId={cardId}
          onChangeCardId={setCardId}
          detectedDigits={detectedDigits}
          onCancel={() => setShowCardConfirm(false)}
          onConfirm={() => {
            setCardConfident(true);
            setShowCardConfirm(false);
            doSave();
          }}
          onCardCreated={(card) => {
            setCardsList((prev) => [...prev, card]);
            setCardId(card.id);
          }}
        />
      )}
    </div>
  );
}
