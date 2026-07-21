"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Lock, Pencil, Unlock } from "lucide-react";
import { Spinner, WaveformLoader } from "@/components/loader";
import { formatCents, parseBRLToCents } from "@/lib/money";
import { referenceMonthFromDueDate } from "@/lib/invoice";
import {
  dedupeKey,
  isImportable,
  matchCategoryByName,
  normalizeText,
  reconcile,
  stripInstallmentSuffix,
  type ExtractedInvoice,
  type ExtractedTipo,
} from "@/lib/invoice-import";
import { getExistingInvoiceKeys, importarGastosDaFatura } from "@/app/(app)/gastos/importar/actions";
import { ConfirmCardModal } from "@/components/confirm-card-modal";
import { CardSelect } from "@/components/card-select";

const MAX_BYTES = 4 * 1024 * 1024;

interface Card {
  id: string;
  name: string;
  last_four: string | null;
  color: string | null;
  closing_day: number;
  due_day: number;
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
    // Nome amigável criado pela IA vira o título editável; cai no bruto se a IA
    // não conseguiu limpar. O token de parcela é removido de qualquer forma.
    description: stripInstallmentSuffix(it.nome_amigavel?.trim() || it.descricao, it.parcela),
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

/**
 * Palpite de cartão por emissor/bandeira, usado só quando o PDF não traz os 4
 * dígitos. Casa quando o nome de um cartão cadastrado aparece no texto de
 * emissor/bandeira da fatura (ou vice-versa) e é o ÚNICO candidato — ambíguo não
 * conta. É apenas pré-seleção: nunca marca o cartão como confiável (isso é
 * exclusivo do match por dígitos), então o usuário sempre confirma no modal.
 */
function matchCardByIssuer(inv: ExtractedInvoice, cards: Card[]): Card | undefined {
  const hay = normalizeText(`${inv.emissor ?? ""} ${inv.bandeira ?? ""}`).trim();
  if (hay.length < 3) return undefined;
  const matches = cards.filter((c) => {
    const name = normalizeText(c.name);
    return name.length >= 3 && (hay.includes(name) || name.includes(hay));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function ImportInvoice({
  cards,
  categories,
  currentMonth,
  initialCardId,
}: {
  cards: Card[];
  categories: Category[];
  currentMonth: string; // YYYY-MM-01
  // Cartão pré-selecionado quando a importação foi aberta a partir do detalhe de
  // um cartão. Tem prioridade sobre a auto-detecção pós-upload — o usuário disse
  // explicitamente de qual cartão é esta fatura.
  initialCardId?: string;
}) {
  const [phase, setPhase] = useState<"upload" | "review">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [cardsList, setCardsList] = useState<Card[]>(cards);
  const [cardId, setCardId] = useState(
    initialCardId && cards.some((c) => c.id === initialCardId) ? initialCardId : "",
  );
  const [referenceMonth, setReferenceMonth] = useState(currentMonth);
  // A competência é DERIVADA do vencimento + ciclo do cartão e fica travada por
  // padrão; o usuário pode destravar ("Ajustar") para corrigir manualmente.
  const [competenceLocked, setCompetenceLocked] = useState(true);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());

  // Cartão veio de um match confiável (últimos 4 dígitos do PDF) ou de um
  // fallback (nenhum cartão bateu, caiu no primeiro da lista)? No segundo caso
  // exigimos confirmação antes de gravar — é onde o usuário costuma esquecer
  // de trocar o cartão errado. Trocar manualmente também conta como confiável.
  const [cardConfident, setCardConfident] = useState(false);
  const [detectedDigits, setDetectedDigits] = useState<string | null>(null);
  const [showCardConfirm, setShowCardConfirm] = useState(false);

  // Itens abertos em modo de edição (por padrão a lista é modo leitura, mais limpa).
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const toggleEditing = (id: string) =>
    setEditingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name;
  const shortDate = (iso: string) =>
    iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso;

  // Deriva a competência (`YYYY-MM-01`) do VENCIMENTO extraído + ciclo do cartão.
  // É o cálculo determinístico pedido: a competência do app é o mês em que a
  // fatura fecha, não o do vencimento. Sem vencimento/cartão, cai na sugestão da
  // IA e, por fim, no mês corrente.
  function deriveCompetence(card: Card | undefined, inv: ExtractedInvoice | null): string {
    const venc = inv?.vencimento;
    if (card && venc && /^\d{4}-\d{2}-\d{2}$/.test(venc)) {
      return referenceMonthFromDueDate(venc, {
        closingDay: card.closing_day,
        dueDay: card.due_day,
      });
    }
    const sug = inv?.competencia_sugerida;
    return sug && /^\d{4}-\d{2}$/.test(sug) ? `${sug}-01` : currentMonth;
  }

  // Troca de cartão (manual). Recalcula a competência quando ela está travada —
  // trocar o cartão muda o ciclo, logo muda a competência derivada do vencimento.
  function selectCard(id: string) {
    setCardId(id);
    setCardConfident(true);
    if (competenceLocked) {
      setReferenceMonth(deriveCompetence(cardsList.find((c) => c.id === id), extracted));
    }
  }

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

      // Cartão: se a importação foi aberta a partir de um cartão específico, ele
      // manda — o usuário já disse de qual cartão é a fatura, então é confiável e
      // dispensa a confirmação. Caso contrário, os últimos 4 dígitos são o sinal
      // 100% confiável — quando batem, pré-selecionamos e dispensamos a confirmação.
      // Sem dígitos, tentamos um palpite por emissor/bandeira só para pré-selecionar,
      // mas SEM marcar como confiável (o usuário ainda confirma no modal). Último
      // caso: 1º da lista.
      const digits = inv.ult4_digitos?.replace(/\D/g, "").slice(-4) || null;
      const preselected =
        initialCardId ? cardsList.find((c) => c.id === initialCardId) : undefined;
      const byDigits = digits ? cardsList.find((c) => c.last_four === digits) : undefined;
      const byIssuer = !preselected && !byDigits ? matchCardByIssuer(inv, cardsList) : undefined;
      const chosen = preselected ?? byDigits ?? byIssuer ?? cardsList[0];
      setCardId(chosen?.id ?? "");
      // EXCEÇÃO à confiança do cartão de origem: se os últimos 4 dígitos do PDF
      // batem com OUTRO cartão cadastrado, é provável que a fatura seja daquele
      // cartão (o usuário abriu a importação do cartão errado). Nesse conflito
      // NÃO dispensamos a confirmação — o modal avisa da divergência. Manter o
      // cartão de origem pré-selecionado, mas sempre exigir o "ok" do usuário.
      const digitsContradictSource =
        !!preselected && !!byDigits && byDigits.id !== preselected.id;
      setCardConfident(digitsContradictSource ? false : !!preselected || !!byDigits);
      setDetectedDigits(digits);

      // Competência: derivada do vencimento + ciclo do cartão escolhido; travada.
      setReferenceMonth(deriveCompetence(chosen, inv));
      setCompetenceLocked(true);

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

  // Lista principal = itens importáveis (duplicados entram aqui, marcados e esmaecidos).
  // Pulados = itens não importáveis (pagamento, encargo, etc.) — vão para uma seção compacta.
  const mainItems = items.filter((it) => it.importable);
  const skippedItems = items.filter((it) => !it.importable);

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
        <label className="flex flex-col gap-1 text-sm text-neutral-500">
          Cartão
          <CardSelect
            cards={cardsList}
            value={cardId}
            onChange={selectCard}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm text-neutral-500">
          <div className="flex items-center justify-between gap-1">
            <span>Competência</span>
            <button
              type="button"
              onClick={() => setCompetenceLocked((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand"
              aria-pressed={competenceLocked}
            >
              {competenceLocked ? (
                <>
                  <Lock size={11} /> Ajustar
                </>
              ) : (
                <>
                  <Unlock size={11} /> Travar
                </>
              )}
            </button>
          </div>
          <input
            type="month"
            value={referenceMonth.slice(0, 7)}
            disabled={competenceLocked}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d{4}-\d{2}$/.test(v)) setReferenceMonth(`${v}-01`);
            }}
            className={`rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${
              competenceLocked ? "cursor-not-allowed opacity-60" : ""
            }`}
          />
        </div>
      </div>

      {rec.hasTotal && !rec.ok && (
        <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          <p>
            A soma dos lançamentos (<b>{formatCents(signedSum)}</b>) não bate com o total da fatura (
            <b>{formatCents(totalCents ?? 0)}</b>). Diferença de {formatCents(Math.abs(rec.deltaCents))}{" "}
            — confira se algum item ficou faltando ou com valor errado.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2.5">
        {mainItems.map((it) => {
          const cents = parseBRLToCents(it.valorBrl);
          const invalid = it.include && (cents == null || cents <= 0);
          const isEditing = editingIds.has(it.id);
          const catName = categoryName(it.categoryId);
          return (
            <li
              key={it.id}
              className={`rounded-2xl bg-white p-3.5 shadow-sm transition dark:bg-neutral-900 ${
                isEditing
                  ? "ring-2 ring-brand/40"
                  : invalid
                    ? "ring-1 ring-red-300 dark:ring-red-500/40"
                    : "ring-1 ring-neutral-200/70 dark:ring-white/5"
              } ${it.include ? "" : "opacity-60"}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={it.include}
                  onChange={(e) => updateItem(it.id, { include: e.target.checked })}
                  className="h-5 w-5 shrink-0 rounded accent-brand"
                  aria-label={`Incluir ${it.description}`}
                />
                {isEditing ? (
                  <input
                    value={it.description}
                    onChange={(e) => updateItem(it.id, { description: e.target.value })}
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800"
                    placeholder="Nome do gasto"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleEditing(it.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{it.description || "Sem nome"}</span>
                        <span
                          className={`shrink-0 font-semibold tabular-nums ${invalid ? "text-red-600 dark:text-red-400" : ""}`}
                        >
                          {formatCents(cents ?? 0)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                        <span
                          className={
                            catName
                              ? "rounded-md bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800"
                              : "italic text-neutral-400"
                          }
                        >
                          {catName ?? "Sem categoria"}
                        </span>
                        {it.parcela && (
                          <span className="rounded-md bg-brand/10 px-1.5 py-0.5 font-medium text-brand">
                            Parcela {it.parcela.atual}/{it.parcela.total}
                          </span>
                        )}
                        {it.markAsRecurring && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                            ✓ Recorrente
                          </span>
                        )}
                        {it.suggestedRecurring && !it.markAsRecurring && (
                          <span className="rounded-full border border-dashed border-emerald-400/70 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                            ↻ recorrente?
                          </span>
                        )}
                        {it.duplicate && (
                          <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-neutral-400 dark:bg-neutral-800">
                            já importado
                          </span>
                        )}
                        <span>{shortDate(it.purchaseDate)}</span>
                      </div>
                    </div>
                    <Pencil size={15} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
                  </button>
                )}
              </div>

              {isEditing && (
                <div className="mt-2.5 flex flex-col gap-2 pl-8">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
                      Valor
                      <input
                        inputMode="decimal"
                        value={it.valorBrl}
                        onChange={(e) => updateItem(it.id, { valorBrl: e.target.value })}
                        placeholder="0,00"
                        className={`rounded-lg border bg-neutral-50 px-2.5 py-2 text-sm dark:bg-neutral-800 ${
                          invalid ? "border-red-400" : "border-neutral-200 dark:border-neutral-700"
                        }`}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
                      Data
                      <input
                        type="date"
                        value={it.purchaseDate}
                        onChange={(e) => updateItem(it.id, { purchaseDate: e.target.value })}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                      />
                    </label>
                  </div>
                  <select
                    value={it.categoryId}
                    onChange={(e) => updateItem(it.id, { categoryId: e.target.value })}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between gap-2">
                    {it.suggestedRecurring ? (
                      <button
                        type="button"
                        onClick={() => updateItem(it.id, { markAsRecurring: !it.markAsRecurring })}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                          it.markAsRecurring
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : "border border-dashed border-emerald-400 text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {it.markAsRecurring ? "✓ Recorrente" : "↻ Marcar recorrente"}
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => toggleEditing(it.id)}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-brand"
                    >
                      Concluir
                    </button>
                  </div>
                  {it.statementDescription && it.statementDescription !== it.description && (
                    <p className="truncate text-[11px] text-neutral-400">{it.statementDescription}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}

        {skippedItems.length > 0 && (
          <>
            <li className="px-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Pulados ({skippedItems.length})
            </li>
            {skippedItems.map((it) => (
              <li key={it.id} className="flex items-center gap-3 rounded-xl px-3 py-2 opacity-70">
                <span className="shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                  {TIPO_LABEL[it.tipo]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-500">
                  {it.description || it.statementDescription}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-neutral-400">
                  {formatCents(parseBRLToCents(it.valorBrl) ?? 0)}
                </span>
              </li>
            ))}
          </>
        )}
      </ul>

      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-200/70 dark:bg-neutral-900 dark:ring-white/5">
        <span className="text-sm text-neutral-500">
          {included.length} incluído{included.length === 1 ? "" : "s"}
          {skippedItems.length > 0 &&
            ` · ${skippedItems.length} pulado${skippedItems.length === 1 ? "" : "s"}`}
        </span>
        <span className="text-base font-semibold tabular-nums">{formatCents(includedSum)}</span>
      </div>

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
          onChangeCardId={(id) => {
            setCardId(id);
            if (competenceLocked) {
              setReferenceMonth(deriveCompetence(cardsList.find((c) => c.id === id), extracted));
            }
          }}
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
            if (competenceLocked) setReferenceMonth(deriveCompetence(card, extracted));
          }}
        />
      )}
    </div>
  );
}
