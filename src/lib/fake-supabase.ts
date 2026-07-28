/**
 * Fake mínimo do client Supabase para testar as rotinas com I/O.
 *
 * Existe porque a suíte só cobria módulos puros: `recurring.ts` — a lógica
 * assíncrona mais crítica do domínio — não tinha nenhum teste. Um mock de
 * chamadas não serviria: o que precisa ser verificado é o *efeito* sobre os
 * dados (idempotência, dedupe, vigência), e para isso é preciso um armazém que
 * responda a filtros.
 *
 * Implementa só o subconjunto do PostgREST que o código usa: `select`, `insert`,
 * `update`, `upsert`, `delete`, os filtros `eq/in/lte/gte/is/not`, o `or` de
 * dois termos, os terminadores `single`/`maybeSingle` e a RPC de materialização.
 * Não é um Postgres — é o suficiente para as regras não passarem despercebidas.
 *
 * Arquivo de teste: importado apenas por `*.test.ts`.
 */

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

type Filter = (row: Row) => boolean;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `id-${idCounter}`;
}

/** Compara valores como o Postgres compararia date/text: lexicográfico em ISO. */
function cmp(a: unknown, b: unknown): number {
  if (a == null || b == null) return NaN;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** Um termo do `or(...)`: `coluna.operador.valor` (valor "null" vira null). */
function parseOrTerm(term: string): Filter {
  const [col, op, ...rest] = term.split(".");
  const raw = rest.join(".");
  const value = raw === "null" ? null : raw;
  switch (op) {
    case "is":
      return (r) => r[col] == null && value === null;
    case "eq":
      return (r) => r[col] === value;
    case "gte":
      return (r) => cmp(r[col], value) >= 0;
    case "lte":
      return (r) => cmp(r[col], value) <= 0;
    default:
      throw new Error(`operador não suportado no or(): ${op}`);
  }
}

class QueryBuilder implements PromiseLike<{ data: Row[] | Row | null; error: null }> {
  private filters: Filter[] = [];
  private pending: { kind: "select" | "insert" | "update" | "upsert" | "delete"; payload?: unknown } =
    { kind: "select" };
  private one: "single" | "maybeSingle" | null = null;
  private countMode = false;
  private headMode = false;

  constructor(
    private store: Store,
    private table: string,
    private onQuery: (table: string, kind: string) => void,
  ) {}

  private rows(): Row[] {
    return (this.store[this.table] ??= []);
  }

  private matching(): Row[] {
    return this.rows().filter((r) => this.filters.every((f) => f(r)));
  }

  select(_cols?: string, opts?: { head?: boolean; count?: "exact" }) {
    if (this.pending.kind === "select") this.pending = { kind: "select" };
    this.countMode = opts?.count === "exact";
    this.headMode = opts?.head === true;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.pending = { kind: "insert", payload };
    return this;
  }

  update(payload: Row) {
    this.pending = { kind: "update", payload };
    return this;
  }

  upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.pending = { kind: "upsert", payload: { rows: payload, opts } };
    return this;
  }

  delete() {
    this.pending = { kind: "delete" };
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }

  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }

  lte(col: string, value: unknown) {
    this.filters.push((r) => cmp(r[col], value) <= 0);
    return this;
  }

  gte(col: string, value: unknown) {
    this.filters.push((r) => cmp(r[col], value) >= 0);
    return this;
  }

  lt(col: string, value: unknown) {
    this.filters.push((r) => cmp(r[col], value) < 0);
    return this;
  }

  is(col: string, value: null) {
    this.filters.push((r) => r[col] == null && value === null);
    return this;
  }

  not(col: string, op: "is", value: null) {
    if (op !== "is" || value !== null) throw new Error("not() só suporta ('col', 'is', null)");
    this.filters.push((r) => r[col] != null);
    return this;
  }

  or(expr: string) {
    const terms = expr.split(",").map(parseOrTerm);
    this.filters.push((r) => terms.some((t) => t(r)));
    return this;
  }

  order(_col: string, _opts?: unknown) {
    return this;
  }

  single() {
    this.one = "single";
    return this;
  }

  maybeSingle() {
    this.one = "maybeSingle";
    return this;
  }

  private run(): { data: Row[] | Row | null; error: null; count?: number } {
    this.onQuery(this.table, this.pending.kind);
    const rows = this.rows();

    if (this.pending.kind === "insert" || this.pending.kind === "upsert") {
      const isUpsert = this.pending.kind === "upsert";
      const raw = isUpsert
        ? (this.pending.payload as { rows: Row | Row[] }).rows
        : (this.pending.payload as Row | Row[]);
      const opts = isUpsert
        ? (this.pending.payload as { opts?: { onConflict?: string; ignoreDuplicates?: boolean } })
            .opts
        : undefined;
      const list = Array.isArray(raw) ? raw : [raw];
      const inserted: Row[] = [];
      for (const row of list) {
        if (opts?.onConflict) {
          const keys = opts.onConflict.split(",").map((k) => k.trim());
          const clash = rows.find((r) => keys.every((k) => r[k] === row[k]));
          if (clash) {
            if (opts.ignoreDuplicates) continue;
            Object.assign(clash, row);
            inserted.push(clash);
            continue;
          }
        }
        const withId = { id: nextId(), ...row };
        rows.push(withId);
        inserted.push(withId);
      }
      return this.shape(inserted);
    }

    if (this.pending.kind === "update") {
      const patch = this.pending.payload as Row;
      const hit = this.matching();
      for (const r of hit) Object.assign(r, patch);
      return this.shape(hit);
    }

    if (this.pending.kind === "delete") {
      const hit = new Set(this.matching());
      this.store[this.table] = rows.filter((r) => !hit.has(r));
      return this.shape([...hit]);
    }

    const hit = this.matching();
    if (this.countMode) {
      return { data: this.headMode ? null : hit, error: null, count: hit.length };
    }
    return this.shape(hit);
  }

  private shape(hit: Row[]) {
    if (this.one === "single") return { data: hit[0] ?? null, error: null };
    if (this.one === "maybeSingle") return { data: hit[0] ?? null, error: null };
    return { data: hit, error: null };
  }

  then<R1 = { data: Row[] | Row | null; error: null }, R2 = never>(
    onfulfilled?: ((v: { data: Row[] | Row | null; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    } catch (err) {
      return Promise.reject(err).then(onfulfilled, onrejected);
    }
  }
}

export interface FakeDB {
  from(table: string): QueryBuilder;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null }>;
  /** Conteúdo bruto do armazém, para asserções. */
  tables: Store;
  /** Log `tabela:operação` (e `rpc:<fn>`) de cada query — usado para detectar N+1. */
  queries: string[];
}

/** Cria um client fake já semeado com as tabelas informadas. */
export function createFakeDB(seed: Store = {}): FakeDB {
  const tables: Store = {};
  for (const [t, rows] of Object.entries(seed)) {
    tables[t] = rows.map((r) => ({ id: nextId(), ...r }));
  }
  const queries: string[] = [];

  /**
   * Só a RPC de materialização é simulada — é a única que os testes exercitam.
   * Aplica os inserts na mesma ordem da função Postgres (transações → parcelas →
   * capas, estas com `on conflict do nothing`) e devolve quantas transações
   * entraram, como o `get diagnostics row_count` da função.
   */
  function materializeRecurringAtomic(args: Record<string, unknown>) {
    const userId = args.p_user_id as string;
    const txs = (args.p_transactions ?? []) as Row[];
    const insts = (args.p_installments ?? []) as Row[];
    const invs = (args.p_invoices ?? []) as Row[];

    const table = (name: string) => (tables[name] ??= []);

    queries.push("transactions:insert");
    for (const t of txs) table("transactions").push({ user_id: userId, ...t });

    queries.push("installments:insert");
    for (const i of insts) table("installments").push({ id: nextId(), user_id: userId, ...i });

    queries.push("invoices:insert");
    for (const v of invs) {
      const clash = table("invoices").find(
        (r) => r.card_id === v.card_id && r.reference_month === v.reference_month,
      );
      if (clash) continue;
      table("invoices").push({ id: nextId(), user_id: userId, status: "open", ...v });
    }
    return txs.length;
  }

  return {
    tables,
    queries,
    from(table: string) {
      return new QueryBuilder(tables, table, (t, kind) => queries.push(`${t}:${kind}`));
    },
    rpc(fn: string, args: Record<string, unknown>) {
      queries.push(`rpc:${fn}`);
      if (fn !== "materialize_recurring_atomic") {
        throw new Error(`rpc não suportada no fake: ${fn}`);
      }
      return Promise.resolve({ data: materializeRecurringAtomic(args), error: null });
    },
  };
}
