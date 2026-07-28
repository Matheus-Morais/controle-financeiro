"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Lock, Unlock } from "lucide-react";
import { Spinner } from "@/components/loader";
import { AnalyzingInvoiceOverlay } from "@/components/analyzing-invoice-overlay";
import { formatCents, parseBRLToCents } from "@/lib/money";
import { referenceMonthFromDueDate } from "@/lib/invoice";
import { formatDayMonth } from "@/lib/date";
import {
  classifyReviewItem,
  isImportable,
  matchCategoryByName,
  normalizeText,
  reconcile,
  resolveInvoiceItem,
  stripInstallmentSuffix,
  type ExistingOccurrence,
  type ExistingRecurring,
  type ExtractedInvoice,
  type ExtractedTipo,
  type ReviewGroupKey,
} from "@/lib/invoice-import";
import {
  getExistingInvoiceContext,
  importarGastosDaFatura,
} from "@/app/(app)/gastos/importar/actions";
import { ConfirmCardModal } from "@/components/confirm-card-modal";
import { CardSelect } from "@/components/card-select";
import { MonthStepper } from "@/components/month-stepper";
import { ImportReviewItem, type EditableItem } from "@/components/import-review-item";

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

const TIPO_LABEL: Record<ExtractedTipo, string> = {
  compra: "Compra",
  credito: "Crédito/estorno",
  encargo: "Encargo",
  pagamento: "Pagamento",
  outro: "Outro",
};

/** Subgrupos de cada seção, na ordem em que aparecem na tela. */
const NEW_GROUPS: { key: ReviewGroupKey; label: string }[] = [
  { key: "new-installment", label: "Parcelados" },
  { key: "new-single", label: "À vista" },
  { key: "new-recurring", label: "Recorrentes" },
];
// "À vista" só existe aqui quando o mesmo PDF é subido duas vezes; fica por
// último e, como todo subgrupo, só é renderizado quando tem item.
const EXISTING_GROUPS: { key: ReviewGroupKey; label: string }[] = [
  { key: "existing-installment", label: "Parcelados" },
  { key: "existing-recurring", label: "Recorrentes" },
  { key: "existing-single", label: "À vista" },
];

const sumItems = (list: EditableItem[]) =>
  list.reduce((s, it) => s + (parseBRLToCents(it.valorBrl) ?? 0), 0);

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
    match: null,
    linkedRecurringId: null,
    linkedRecurringName: null,
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
  // O que o cartão já tem: ocorrências gravadas (todos os meses) + assinaturas
  // vigentes na competência. É o que separa "novo" de "já importado".
  const [existing, setExisting] = useState<{
    occurrences: ExistingOccurrence[];
    recurrings: ExistingRecurring[];
  }>({ occurrences: [], recurrings: [] });
  const [showExisting, setShowExisting] = useState(false);

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

  // Busca o que já existe na competência quando muda cartão/competência.
  useEffect(() => {
    if (phase !== "review" || !cardId || !referenceMonth) return;
    let active = true;
    getExistingInvoiceContext(cardId, referenceMonth)
      .then((ctx) => active && setExisting(ctx))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [phase, cardId, referenceMonth]);

  // Casa cada lançamento com o que já está gravado: o que já existe é desmarcado
  // (o usuário ainda pode remarcar) e o que bate com uma assinatura cadastrada
  // nasce vinculado a ela, para não duplicar o template na gravação.
  useEffect(() => {
    setItems((prev) =>
      prev.map((it) => {
        if (!it.importable) return it;
        const matchable = {
          statementDescription: it.statementDescription,
          description: it.description,
          amountCents: parseBRLToCents(it.valorBrl) ?? 0,
          purchaseDate: it.purchaseDate,
          parcela: it.parcela,
        };
        const { match, recurring } = resolveInvoiceItem(
          matchable,
          existing.occurrences,
          existing.recurrings,
          referenceMonth,
        );
        // Só vincula quando o item ainda vai ser gravado; o que já existe não
        // precisa de template (e não deve nascer marcado como recorrente).
        const template = match ? null : recurring;
        return {
          ...it,
          match,
          linkedRecurringId: template?.id ?? null,
          linkedRecurringName: template?.description ?? null,
          markAsRecurring: template ? true : it.markAsRecurring,
          include: match ? false : it.include,
        };
      }),
    );
  }, [existing, referenceMonth]);

  const updateItem = (id: string, patch: Partial<EditableItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

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

  // Itens importáveis divididos em Novos × Já importados, cada um por natureza do
  // gasto. Marcar um item como recorrente o move de "À vista" para "Recorrentes"
  // na hora, porque o grupo é derivado do estado.
  const groups = useMemo(() => {
    const g: Record<ReviewGroupKey, EditableItem[]> = {
      "new-installment": [],
      "new-single": [],
      "new-recurring": [],
      "existing-installment": [],
      "existing-single": [],
      "existing-recurring": [],
    };
    for (const it of items) {
      if (!it.importable) continue;
      g[classifyReviewItem(it)].push(it);
    }
    return g;
  }, [items]);

  // Pulados = itens não importáveis (pagamento, crédito) — seção compacta no fim.
  const skippedItems = items.filter((it) => !it.importable);
  const newItems = NEW_GROUPS.flatMap((g) => groups[g.key]);
  const existingItems = EXISTING_GROUPS.flatMap((g) => groups[g.key]);

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
        // Vinculado a uma assinatura existente → usa o template dela; senão, o
        // "marcar recorrente" cria um novo.
        mark_as_recurring: it.markAsRecurring && !it.linkedRecurringId,
        recurring_id: it.linkedRecurringId,
      })),
    });
  }

  /** Um subgrupo (Parcelados / À vista / Recorrentes); some quando vazio. */
  function renderGroup(label: string, list: EditableItem[]) {
    if (list.length === 0) return null;
    return (
      <div key={label} className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {label} · {list.length}
          </h3>
          <span className="text-[11px] tabular-nums text-neutral-400">
            {formatCents(sumItems(list))}
          </span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {list.map((it) => (
            <ImportReviewItem
              key={it.id}
              item={it}
              categories={categories}
              isEditing={editingIds.has(it.id)}
              onToggleEdit={() => toggleEditing(it.id)}
              onChange={(patch) => updateItem(it.id, patch)}
            />
          ))}
        </ul>
      </div>
    );
  }

  // ── Fase 1: upload ──────────────────────────────────────────────────────
  if (phase === "upload") {
    return (
      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        {/* Overlay de análise da IA: tela cheia, acima da bottom-nav. */}
        {uploading && <AnalyzingInvoiceOverlay />}
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
      {/* Cabeçalho: cartão e competência em linhas de largura total — o mês por
          extenso não cabia no campo de meia coluna. */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-neutral-200/70 dark:bg-neutral-900 dark:ring-white/5">
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Cartão
          <CardSelect cards={cardsList} value={cardId} onChange={selectCard} />
        </label>

        <div className="h-px bg-neutral-100 dark:bg-neutral-800" />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Competência
            </span>
            <button
              type="button"
              onClick={() => setCompetenceLocked((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-brand"
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
          <MonthStepper
            value={referenceMonth}
            onChange={setReferenceMonth}
            disabled={competenceLocked}
          />
          {extracted?.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(extracted.vencimento) && (
            <p className="text-[11px] text-neutral-400">
              Vencimento impresso na fatura: {formatDayMonth(extracted.vencimento)}
            </p>
          )}
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

      {/* ── Novos ── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-sm font-bold">Novos</h2>
          <span className="text-xs text-neutral-500">
            {newItems.length} {newItems.length === 1 ? "item" : "itens"} ·{" "}
            <span className="font-semibold tabular-nums">{formatCents(sumItems(newItems))}</span>
          </span>
        </div>
        {newItems.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-neutral-500 shadow-sm ring-1 ring-neutral-200/70 dark:bg-neutral-900 dark:ring-white/5">
            Nenhum lançamento novo — esta fatura já foi importada nesta competência.
          </p>
        ) : (
          NEW_GROUPS.map((g) => renderGroup(g.label, groups[g.key]))
        )}
      </section>

      {/* ── Já importados (recolhido por padrão) ── */}
      {existingItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowExisting((v) => !v)}
            aria-expanded={showExisting}
            className="flex items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-neutral-200/70 dark:bg-neutral-900 dark:ring-white/5"
          >
            <span className="flex items-center gap-1.5 text-sm font-bold text-neutral-500">
              <ChevronDown
                size={16}
                className={`transition-transform ${showExisting ? "" : "-rotate-90"}`}
              />
              Já importados
            </span>
            <span className="text-xs text-neutral-400">
              {existingItems.length} {existingItems.length === 1 ? "item" : "itens"} ·{" "}
              <span className="font-semibold tabular-nums">
                {formatCents(sumItems(existingItems))}
              </span>
            </span>
          </button>
          {showExisting &&
            EXISTING_GROUPS.map((g) => renderGroup(g.label, groups[g.key]))}
        </section>
      )}

      {/* ── Pulados ── */}
      {skippedItems.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="px-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Pulados ({skippedItems.length})
          </h2>
          <ul>
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
          </ul>
        </section>
      )}

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
