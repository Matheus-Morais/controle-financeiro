# Plano de Implementação — Ajustes

Resultado da auditoria de fluxos, regras de negócio, segurança e práticas de desenvolvimento
(análise em **2026-07-26**, branch `fix/importar-recorrentes-revisao`).

Cada ajuste tem um id (`AJ-XX`) citado em [REGRAS-DE-NEGOCIO.md](REGRAS-DE-NEGOCIO.md).
Baseline no momento da análise: **96 testes passando**, typecheck e lint limpos.

> **Status: executado.** AJ-01 a AJ-26 aplicados; as regras correspondentes em
> [REGRAS-DE-NEGOCIO.md](REGRAS-DE-NEGOCIO.md) foram reescritas e não há mais marcadores ⚠️.
> Suíte em **114 testes**. Duas validações do plano seguem **em aberto** por dependerem de
> ambiente que este repositório não provisiona:
>
> - **Testes de RLS contra um Supabase local** (AJ-14, item 3) — exigem `supabase start`.
> - **Smoke E2E do fluxo principal** (AJ-14, item 4) — exige runner de browser (Playwright).
>
> As migrations `0010`–`0015` precisam ser aplicadas **antes** do deploy: o código já chama as
> funções RPC e usa as colunas novas. Ver os riscos por ajuste no fim deste documento.

---

## Sumário executivo

| Severidade | Qtd | Natureza |
|---|---|---|
| 🔴 **P0 — Crítico** | 2 | Funcionalidade quebrada em produção; risco de perda de dados |
| 🟠 **P1 — Alto** | 7 | Isolamento entre usuários, custo, correção de cálculo |
| 🟡 **P2 — Médio** | 11 | Consistência de dados, performance, cobertura de teste |
| ⚪ **P3 — Baixo** | 6 | Débito técnico, documentação, portabilidade |

**O achado que muda o produto hoje:** o cron **nunca executou**. O middleware intercepta
`/api/cron/notifications` e devolve `307 → /login` antes de a rota validar o `CRON_SECRET`
(verificado com `curl`, com e sem o Bearer correto). Isso significa que, desde o deploy,
**nenhum push foi enviado** e **nenhuma renda recorrente foi materializada**.

### Ordem sugerida de execução

```
Sprint 1 (correção)     AJ-01 → AJ-02 → AJ-03 → AJ-04 → AJ-06
Sprint 2 (blindagem)    AJ-05 → AJ-07 → AJ-08 → AJ-09 → AJ-18
Sprint 3 (consistência) AJ-10 → AJ-11 → AJ-12 → AJ-13 → AJ-19
Sprint 4 (sustentação)  AJ-14 → AJ-15 → AJ-16 → AJ-17 → AJ-20 → P3
```

---

# 🔴 P0 — Crítico

## AJ-01 — O cron nunca executa: middleware sequestra `/api/cron`

**Regra afetada:** RN-25, RN-29, RN-46, RN-49
**Arquivo:** [`src/middleware.ts:66-71`](../src/middleware.ts#L66-L71)

### Diagnóstico

O `matcher` do middleware exclui estáticos, mas **não exclui `/api`**. A requisição do Vercel Cron
não carrega cookie de sessão, então `user` é `null`, `isPublic` é `false`, e o middleware redireciona
antes de a rota checar o `CRON_SECRET`.

Verificado localmente:

```
$ curl -i -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/notifications
HTTP/1.1 307 Temporary Redirect
location: http://localhost:3000/login
```

### Impacto

| Consequência | Gravidade |
|---|---|
| Nenhum push enviado (mensal, semanal, contas a vencer) | Funcionalidade inteira morta |
| `materializeRecurringIncomes` nunca roda — é chamada **só** pelo cron | Renda recorrente não se repete |
| Materialização de assinaturas depende do fallback preguiçoso nas telas | Funciona, mas por acidente |

### Correção

Excluir `/api` do matcher — rotas de API fazem a própria autorização (`CRON_SECRET` no cron,
`getUser()` no export e na importação), e não precisam de renovação de cookie.

```ts
// src/middleware.ts
export const config = {
  matcher: [
    // Ignora estáticos E as rotas de API — cada rota de /api faz a própria
    // autorização (CRON_SECRET no cron, sessão no export/importar). Sem esta
    // exclusão o cron, que não tem cookie, é redirecionado para /login.
    "/((?!api/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|logo.svg|logo-maskable.svg).*)",
  ],
};
```

### Validação

- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/notifications` → `200 {"ok":true,...}`
- [ ] `curl .../api/cron/notifications` (sem header) → `401`, **não** 307
- [ ] `/api/export` sem sessão → `401` (a rota já checa `getUser()`)
- [ ] `/api/faturas/importar` sem sessão → `401`
- [ ] Teste de regressão que trave o matcher (ver AJ-14)

> **Depois de corrigir:** rodar o cron manualmente uma vez para materializar as rendas recorrentes
> represadas, e conferir se não houve duplicação de competências.

---

## AJ-02 — Escritas multi-tabela não são atômicas

**Regra afetada:** RN-19, "Fronteiras que a RLS não cobre"
**Arquivos:** [`gastos/novo/actions.ts`](<../src/app/(app)/gastos/novo/actions.ts>),
[`gastos/[id]/actions.ts`](<../src/app/(app)/gastos/[id]/actions.ts>),
[`gastos/importar/actions.ts:131-149`](<../src/app/(app)/gastos/importar/actions.ts#L131-L149>)

### Diagnóstico

Cada fluxo de gravação faz 3–4 chamadas PostgREST independentes. Não há transação: falha no meio
deixa o banco inconsistente. O caso mais grave é a **edição**, que apaga antes de inserir:

```ts
// gastos/[id]/actions.ts:99
await supabase.from("installments").delete().eq("transaction_id", id);  // ← apagou
const { error: instErr } = await supabase.from("installments").insert(...); // ← se falhar aqui…
if (instErr) return { error: instErr.message };  // …o gasto ficou SEM NENHUMA parcela
```

O gasto some de todas as faturas e relatórios, mas a transação continua existindo — órfã e invisível.
Na importação, uma falha entre `transactions` e `installments` deixa dezenas de transações órfãs, e
o próprio código reconhece a limitação (`// Gravação em lote (não atômica; ver limitação no plano)`).

### Correção

Migrar cada sequência para uma função Postgres `security invoker` (a RLS continua valendo, e a
função inteira roda em uma transação) — mesmo padrão já usado com sucesso em `reset_account_data()`
na migration 0007.

```sql
-- supabase/migrations/0010_atomic_writes.sql
create or replace function public.create_expense_atomic(
  p_transaction jsonb,
  p_installments jsonb,
  p_invoices jsonb
) returns uuid
language plpgsql
security invoker            -- RLS continua sendo a barreira (RN-06)
set search_path = public
as $$
declare v_tx_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  insert into transactions select * from jsonb_populate_record(null::transactions, p_transaction)
    returning id into v_tx_id;
  insert into installments select * from jsonb_populate_recordset(null::installments, p_installments);
  insert into invoices    select * from jsonb_populate_recordset(null::invoices, p_invoices)
    on conflict (card_id, reference_month) do nothing;

  return v_tx_id;
end $$;

grant execute on function public.create_expense_atomic(jsonb, jsonb, jsonb) to authenticated;
```

Funções equivalentes para `update_expense_atomic` e `import_invoice_atomic`.

### Validação

- [ ] Teste de integração: forçar erro no insert de parcelas → transação **não** persiste
- [ ] Edição que falha na regeneração → parcelas antigas **intactas**
- [ ] Importação que falha no meio → nenhuma transação órfã
- [ ] `pnpm test` verde

---

# 🟠 P1 — Alto

## AJ-03 — FKs cross-tenant não validadas

**Regra afetada:** RN-44
**Arquivos:** `gastos/novo/actions.ts`, `gastos/[id]/actions.ts`, `recorrentes/actions.ts`

### Diagnóstico

A RLS aprova um `insert` cujo `user_id` é o do requisitante — **mesmo que as FKs apontem para
registros de outro usuário**. A policy só olha a linha inserida, não o dono do alvo da FK.

A importação faz isso **corretamente** (`ownCategories`, `ownRecurrings`), com o comentário
`// RLS não valida FK`. O padrão existe; só não foi aplicado nos demais fluxos:

| Ação | `card_id` | `account_id` | `category_id` |
|---|---|---|---|
| `createExpense` | ✅ (select RLS) | ❌ | ❌ |
| `updateExpense` | ✅ (select RLS) | ❌ | ❌ |
| `createRecurring` | ❌ | ❌ | ❌ |
| `criarRecorrenteDeTransacao` | herda da tx ✅ | herda ✅ | herda ✅ |
| `importarGastosDaFatura` | ✅ | — | ✅ |

**Exploração:** um usuário que forje o `POST` do Server Action com o `category_id` de outra conta
grava um gasto categorizado com um id alheio. Não vaza dados (a leitura é filtrada por RLS), mas
corrompe a integridade e produz relatórios com categoria "fantasma".

### Correção

**Camada 1 — validação explícita no Server Action** (padrão da importação):

```ts
// helper reutilizável, ex.: src/lib/ownership.ts
async function assertOwned(db: DB, table: "cards" | "accounts" | "categories", id: string | null) {
  if (!id) return null;
  const { data } = await db.from(table).select("id").eq("id", id).maybeSingle();
  return data ? id : null;  // RLS já filtra por dono
}
```

**Camada 2 — defesa no banco** (garantia real, independe do código da aplicação):

```sql
-- supabase/migrations/0011_composite_fk.sql
-- Chave composta permite a FK carregar o user_id, tornando o vínculo
-- cross-tenant impossível no nível do banco.
alter table categories add constraint categories_id_user_uk unique (id, user_id);
alter table cards      add constraint cards_id_user_uk      unique (id, user_id);
alter table accounts   add constraint accounts_id_user_uk   unique (id, user_id);

alter table transactions
  drop constraint transactions_category_id_fkey,
  add constraint transactions_category_fk
    foreign key (category_id, user_id) references categories (id, user_id) on delete set null;
-- idem para card_id, account_id em transactions, installments, recurring_expenses
```

### Validação

- [ ] Teste: gravar gasto com `category_id` de outro usuário → rejeitado
- [ ] Migration aplicada sem violar dados existentes (rodar `select` de auditoria antes)

---

## AJ-04 — Timezone do usuário ignorado fora do dashboard

**Regra afetada:** RN-08 (invariante do CLAUDE.md)
**Arquivos:** `cartoes/[id]/page.tsx:33`, `contas/page.tsx:21,67`, `recorrentes/page.tsx:31`,
`recorrentes/actions.ts:94`, `gastos/importar/`

### Diagnóstico

`currentReferenceMonth()` e `todayISO()` aceitam um `tz`, mas **só o dashboard o passa**:

```ts
// (app)/page.tsx — correto
const tz = profile?.timezone ?? DEFAULT_TZ;
const month = mes ?? currentReferenceMonth(tz);

// cartoes/[id]/page.tsx:33 — usa o default America/Sao_Paulo
const currentMonth = currentReferenceMonth();
```

Para um usuário em Lisboa (UTC+1) na virada do mês, o dashboard mostra agosto e a tela do cartão
mostra julho. Pior: `changeRecurringCard` calcula o **corte de ciclo** com o mês errado, movendo a
assinatura para o mês incorreto — efeito permanente no dado.

### Correção

Carregar o `tz` do profile nas páginas afetadas e propagá-lo. Para os Server Actions, extrair um
helper que resolve o timezone do usuário logado:

```ts
// src/lib/user-time.ts
/** Timezone do usuário logado, com fallback. Único ponto de leitura do profile p/ calendário. */
export async function userTimezone(db: DB, userId: string): Promise<string> {
  const { data } = await db.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  return data?.timezone ?? "America/Sao_Paulo";
}
```

Adicionar regra de lint (ou teste de arquitetura) que barre `currentReferenceMonth()` /
`todayISO()` **sem argumento** fora de `date.ts`.

### Validação

- [ ] Teste com `TZ=Pacific/Kiritimati` e `TZ=Pacific/Honolulu` na virada do mês
- [ ] `changeRecurringCard` usa o mês do usuário, não o do servidor

---

## AJ-05 — Sem rate limiting no endpoint de IA

**Regra afetada:** "Fronteiras que a RLS não cobre"
**Arquivo:** [`src/app/api/faturas/importar/route.ts`](../src/app/api/faturas/importar/route.ts)

### Diagnóstico

A rota valida sessão, tipo, tamanho e magic bytes — mas **não limita frequência**. Cada chamada é
uma requisição a `claude-opus-4-8` com até 16k tokens de saída e um PDF de até 4 MB. Uma sessão
autenticada em loop gera custo ilimitado na conta Anthropic.

Não é hipotético: é o único endpoint do app com custo marginal por request.

### Correção

Quota por usuário persistida no banco (funciona serverless, sem depender de memória do processo):

```sql
-- supabase/migrations/0012_import_quota.sql
create table invoice_import_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index invoice_import_user_time_idx on invoice_import_log (user_id, created_at desc);
alter table invoice_import_log enable row level security;
create policy iil_select on invoice_import_log for select using (user_id = auth.uid());
create policy iil_insert on invoice_import_log for insert with check (user_id = auth.uid());
```

Na rota, antes de chamar a IA: contar importações na última hora / nas últimas 24 h e devolver
`429` com `Retry-After` ao exceder (sugestão: **10/h** e **30/dia**).

Complementar com **timeout explícito** no client Anthropic — ver AJ-18.

### Validação

- [ ] 11ª chamada na mesma hora → `429`
- [ ] Contador é por usuário, não global
- [ ] Erro amigável na UI ("Você atingiu o limite de importações desta hora")

---

## AJ-06 — `claim()` silencia notificações em erro transitório

**Regra afetada:** RN-47
**Arquivo:** [`src/app/api/cron/notifications/route.ts:143-153`](../src/app/api/cron/notifications/route.ts#L143-L153)

### Diagnóstico

```ts
const { error } = await supabase.from("notification_log").insert({...});
return !error; // conflito (unique) → já enviado hoje
```

O comentário assume que **todo** erro é o conflito de unicidade. Um timeout, uma queda de conexão ou
um erro de permissão também retornam `error` — e a notificação do dia é descartada em silêncio, sem
log e sem retry. Como o cron roda 1×/dia, o lembrete daquele dia se perde para sempre.

### Correção

```ts
async function claim(...): Promise<boolean> {
  const { error } = await supabase.from("notification_log").insert({ user_id: userId, type, sent_for: sentFor });
  if (!error) return true;
  if (error.code === "23505") return false;          // unique_violation → já enviado, ok
  // Qualquer outro erro é falha de infra: registra e NÃO consome o envio do dia.
  console.error("[cron] falha ao reivindicar notificação:", { type, code: error.code });
  return false;
}
```

E fazer o handler devolver a contagem de falhas no corpo, para dar visibilidade no log da Vercel.

### Validação

- [ ] Teste unitário com `error.code = "23505"` → `false` sem log
- [ ] Teste com `error.code = "57014"` (timeout) → `false` **com** log de erro
- [ ] Resposta do cron inclui `{ ok, sent, failed }`

---

## AJ-07 — Cabeçalhos de segurança ausentes

**Arquivo:** [`next.config.mjs`](../next.config.mjs)

### Diagnóstico

O `headers()` só configura o service worker. Faltam os cabeçalhos básicos: **CSP**,
`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`X-Frame-Options`. Um app financeiro sem CSP nem proteção de framing é exposição desnecessária —
principalmente porque a tela de revisão renderiza **texto extraído de PDF de terceiros**.

### Correção

```js
// next.config.mjs
const securityHeaders = [
  { key: "Content-Security-Policy", value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",       // Next injeta inline; migrar p/ nonce depois
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ") },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Frame-Options", value: "DENY" },
];
// … async headers() { return [{ source: "/(.*)", headers: securityHeaders }, /* sw.js … */]; }
```

### Validação

- [ ] `curl -I` mostra todos os cabeçalhos em produção
- [ ] App funciona sem violação de CSP no console (checar Recharts e o SW)
- [ ] securityheaders.com nota ≥ A

---

## AJ-08 — Export CSV sem `no-store`

**Regra afetada:** RN-45 (paridade de tratamento de PII)
**Arquivo:** [`src/app/api/export/route.ts:84-89`](../src/app/api/export/route.ts#L84-L89)

### Diagnóstico

O CSV contém **o histórico financeiro completo** do usuário e sai sem `Cache-Control`. A rota de
importação já trata PII corretamente (`NO_STORE`); o export não. Proxies e o cache do browser podem
reter o arquivo.

### Correção

```ts
headers: {
  "Content-Type": "text/csv; charset=utf-8",
  "Content-Disposition": `attachment; filename="controle-financeiro-${today}.csv"`,
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
}
```

Aproveitar para **completar o export** (portabilidade LGPD): hoje só há parcelas — faltam
recebimentos, orçamentos e o `due_date` das contas. Ver AJ-21.

---

## AJ-09 — Enumeração de usuários no cadastro

**Regra afetada:** RN-54
**Arquivo:** [`src/app/(auth)/actions.ts:41`](<../src/app/(auth)/actions.ts#L41>)

### Diagnóstico

```ts
if (error) return { error: error.message };   // ← "User already registered"
```

O `signIn` e o `requestPasswordReset` acertam (mensagem genérica, sem revelar cadastro). O `signUp`
devolve o erro cru do Supabase, permitindo descobrir quais e-mails têm conta.

### Correção

Mapear os erros conhecidos para mensagens genéricas e logar o original no servidor:

```ts
if (error) {
  console.error("[signup] falha:", error.status);
  return { error: "Não foi possível criar a conta. Verifique os dados e tente novamente." };
}
```

Adicionar também validação de senha no `signUp` (hoje só `updatePassword` exige 6 caracteres).

---

# 🟡 P2 — Médio

## AJ-10 — Faturas não são recalculadas ao mudar o ciclo do cartão

**Regra:** RN-16 · **Arquivo:** `cartoes/actions.ts:90-117`

`updateCard` altera `closing_day`/`due_day` mas não toca em `invoices`. Como todos os upserts usam
`ignoreDuplicates: true`, as faturas existentes mantêm `closing_date`/`due_date` antigos — e o
dashboard agrupa "o que vence no mês" por `due_date`. Resultado: após ajustar o cartão, o fluxo de
caixa fica errado e não há como corrigir pela UI.

**Correção:** ao detectar mudança de ciclo, recalcular `closing_date`/`due_date` de todas as faturas
**em aberto** (`status = 'open'`) do cartão via `invoiceRefForMonth`. Faturas pagas ficam como estão
(RN-09). Avisar o usuário: *"N faturas em aberto tiveram as datas recalculadas."*

## AJ-11 — Duplo estado de pagamento (fatura vs. parcela)

**Regra:** RN-13, RN-30

`invoices.status` e `installments.status` são independentes. Marcar a fatura como paga **não** marca
as parcelas. O export CSV então lista "Aberta" para parcelas de uma fatura quitada.

**Correção:** definir a fonte da verdade — para cartão, é a **fatura**; para conta, é a **parcela**.
Fazer o CSV e qualquer leitura derivarem o status da parcela de cartão a partir da fatura dela, e
documentar em RN-13. Alternativa mais cara: propagar o status na hora do toggle.

## AJ-12 — `budgets` sem unique constraint (corrida cria duplicatas)

**Regra:** RN-36 · **Arquivo:** `orcamento/actions.ts:68-93`

`saveBudget` faz *read-then-write* sem constraint no banco. Dois cliques simultâneos criam dois
orçamentos para a mesma categoria, e o `maybeSingle()` seguinte passa a **quebrar**.

```sql
create unique index budgets_user_category_month_uk
  on budgets (user_id, category_id, coalesce(reference_month, '1900-01-01'::date));
```
E trocar o read-then-write por um `upsert` com `onConflict`.

## AJ-13 — Renda recorrente: dedupe frágil e sem encerramento

**Regra:** RN-29 · **Arquivo:** `recurring.ts:153-194`

Dois problemas: (a) a deduplicação usa **só `description`** — duas rendas com o mesmo nome no mês
colidem e uma é perdida; (b) não há `end_month`, então a única forma de encerrar é apagar o
recebimento do mês, o que é pouco descobrível.

**Correção:** deduplicar por `(description, amount_cents, recurring_mode)` e adicionar
`incomes.recurring_end_month`, com um botão "encerrar recorrência" em `/recebimentos`.
Fazer também um `N+1` fix: a rotina consulta uma vez por recebimento dentro do loop.

## AJ-14 — Cobertura de teste: falta o que tem I/O

**Regra:** todas · **Situação:** 96 testes, **todos** em módulos puros

Não há teste para `recurring.ts` (materialização idempotente — a lógica assíncrona mais crítica do
domínio), para nenhum Server Action, nem para as policies de RLS. O bug do AJ-01 passaria por
qualquer suíte atual.

**Correção, em ordem de retorno:**
1. Teste do `matcher` do middleware (trava o AJ-01) — barato, alto valor.
2. `recurring.ts` com um fake do client Supabase: idempotência, soft-delete conta como lançada
   (RN-24), respeito a `start_month`/`end_month`.
3. Testes de RLS/ownership contra um Supabase local (`supabase start`): usuário A não lê/grava
   dados de B; FK cross-tenant rejeitada (AJ-03).
4. Smoke E2E do fluxo principal (login → cartão → gasto parcelado → fatura).

## AJ-15 — `notification_log` cresce sem limite

**Regra:** RN-47

Uma linha por usuário/tipo/dia, para sempre. Só serve para dedupe de curto prazo.

```sql
delete from notification_log where sent_for < current_date - interval '90 days';
```
Agendar via `pg_cron` ou incluir no próprio tick diário.

## AJ-16 — Índices faltando nas queries quentes

| Query | Índice sugerido |
|---|---|
| `spendingByCategory`, `monthlyTotals` | `installments (user_id, reference_month) where deleted_at is null` |
| `materializedRecurringIds`, `softDeleteInstallments` | `transactions (recurring_id) where recurring_id is not null` |
| `materializeRecurringIncomes` | `incomes (user_id, reference_month, is_recurring)` |
| `getExistingInvoiceContext` (aliases) | `transactions (recurring_id, statement_description)` |

Os índices existentes cobrem `(card_id, reference_month)` mas não o caminho por `user_id + mês`, que
é o do dashboard.

## AJ-17 — Server Actions sem checagem de sessão

Nove ações mutam sem chamar `getUser()`: `deleteCard`, `updateCard`, `toggleInvoicePaid`,
`deleteCategory`, `updateCategory`, `toggleRecurringActive`, `deleteRecurring`, `deleteIncome`,
`updateAccount`.

A RLS **protege** (sem sessão, `auth.uid()` é null e nada é afetado), então não é vulnerabilidade —
mas a ação **falha em silêncio**: retorna `void`, o `revalidatePath` roda, e a UI mostra sucesso
sobre uma operação que não aconteceu. Padronizar com o resto da base: checar sessão e retornar erro.

## AJ-18 — Sem timeout explícito na chamada Anthropic

**Arquivo:** `src/lib/anthropic.ts:113`

A rota declara `maxDuration = 60`, mas o SDK usa timeout padrão de ~10 min. Na prática a Vercel mata
a função em 60 s e o usuário recebe um erro genérico de plataforma, sem a mensagem tratada.

```ts
const client = new Anthropic({ timeout: 50_000, maxRetries: 1 });
```
E mapear `Anthropic.APIConnectionTimeoutError` para um `504` com mensagem amigável.

## AJ-19 — Regeneração de parcelas destrói o soft-delete

**Regra:** RN-19, RN-20 · **Arquivo:** `gastos/[id]/actions.ts:99`

O `delete().eq("transaction_id", id)` apaga **fisicamente** todas as parcelas, incluindo as
soft-deleted que a migration 0008 existe para preservar. Além disso, o status `paid` só é preservado
para competências que **continuam existindo** no novo cronograma — encurtar um parcelamento apaga o
registro de que parcelas foram pagas, sem aviso.

**Correção:** preservar `deleted_at` junto com `status` no mapa de competências, e avisar o usuário
quando a edição descartar competências pagas.

## AJ-20 — Sem observabilidade

Erros vão para `console.error` e morrem no log da Vercel. Não há como saber que o cron está quebrado
(AJ-01 passou despercebido justamente por isso), quantas importações falham, ou qual a taxa de
sucesso da reconciliação (RN-40).

**Correção mínima:** Sentry (free tier) para exceções + um contador simples de eventos de domínio
(`import.reconcile.failed`, `cron.push.failed`, `recurring.materialized`). O cron deve devolver
`{ ok, sent, failed, materialized }` e falhar com `500` se a taxa de erro for anômala — assim o
monitor da Vercel acusa.

---

# ⚪ P3 — Débito técnico e documentação

| Id | Item | Ação |
|---|---|---|
| **AJ-21** | Export CSV incompleto (só parcelas) | Incluir recebimentos, orçamentos, `due_date` de contas — portabilidade LGPD |
| **AJ-22** | `ACCOUNT_CLOSING_DAY = 31` duplicado em 3 arquivos | Mover para `src/lib/invoice.ts` e importar |
| **AJ-23** | `CLAUDE.md` desatualizado | Não menciona importação de fatura, contas fora do cartão, onboarding, nem as migrations 0004–0009 |
| **AJ-24** | `credit_limit_cents` coletado e nunca usado | Implementar "limite disponível" ou remover o campo do formulário |
| **AJ-25** | Zod v3 | O SDK Anthropic já espera v4 nos helpers (`anthropic.ts` contorna escrevendo o JSON Schema à mão). Planejar a migração |
| **AJ-26** | Sem `engines` / `.nvmrc` | CI usa Node 22; fixar a versão no `package.json` evita divergência local |

---

## Riscos da execução

| Ajuste | Risco | Mitigação |
|---|---|---|
| AJ-01 | Ao voltar a funcionar, o cron pode materializar vários meses represados | Rodar manualmente 1× e auditar duplicatas antes de reativar o agendamento |
| AJ-02 | Reescrita dos 3 fluxos de gravação principais | Um por vez, com teste de integração antes do merge; manter o caminho antigo até validar |
| AJ-03 (camada 2) | FK composta falha se já existirem vínculos cross-tenant | Rodar `select` de auditoria antes; limpar os órfãos |
| AJ-07 | CSP pode quebrar Recharts / service worker | Subir primeiro em `Content-Security-Policy-Report-Only` |
| AJ-11 | Mudar a fonte da verdade afeta relatórios históricos | Definir a regra em RN-13 antes de codificar |

---

## Checklist de conclusão

- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` verdes
- [ ] Cron responde `200` com o Bearer e `401` sem ele (AJ-01)
- [ ] Nenhum fluxo de gravação deixa registro órfão sob falha (AJ-02)
- [ ] Nenhuma FK aceita id de outro usuário (AJ-03)
- [ ] Todas as decisões de calendário usam o TZ do profile (AJ-04)
- [ ] Cabeçalhos de segurança em produção (AJ-07)
- [ ] [REGRAS-DE-NEGOCIO.md](REGRAS-DE-NEGOCIO.md) sem marcadores ⚠️ pendentes
- [ ] `CLAUDE.md` e `README.md` refletindo o estado real (AJ-23)
