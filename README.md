# 💸 Controle Financeiro

Aplicação **mobile-first** (PWA) para controle financeiro pessoal — substitui a velha planilha.
Cadastre cartões, lance gastos à vista/parcelados/recorrentes, **importe a fatura em PDF com leitura
por IA**, acompanhe cada cartão mês a mês e receba lembretes por notificação para marcar boletos
pagos e atualizar seus gastos.

> Stack 100% em free-tier: **Next.js + Supabase + Vercel**.

## ✨ Funcionalidades

- 🔐 **Login por usuário** (Supabase Auth) com isolamento total de dados (RLS) e recuperação de senha.
- 🚀 **Onboarding guiado** para novos usuários (cartões, renda, categorias, orçamento).
- 💳 **Cartões de crédito** com dia de **fechamento** e **vencimento** — competência calculada automaticamente.
- 🧾 **Gastos**: à vista, **parcelado** (parcelas geradas nas competências certas) e **recorrente** (assinaturas).
- 🤖 **Importar fatura em PDF**: a Claude API lê os lançamentos, sugere nome amigável, categoria e
  identifica parcelas e assinaturas; você revisa e confirma. Deduplica o que já foi lançado.
- 🧾 **Contas fora do cartão** (PIX, boleto, débito, luz/água) com vencimento e lembrete.
- 📆 **Visão mensal por cartão** com abas **Parcelado / Recorrente / À vista** e "faltam X de N".
- ✅ **Marcar fatura/boleto como pago** · exclusão com escopo (só o mês ou daqui em diante, com undo).
- 💰 **Recebimentos** do mês, incluindo recorrência por **dia útil** (respeita feriados nacionais).
- 📊 **Dashboard** com fluxo de caixa do mês, gráficos (Recharts), **categorias** e **orçamento/metas**.
- 🔔 **Notificações Web Push**: boletos do mês, contas a vencer e lembrete semanal configurável.
- 📤 **Exportar CSV** · ♻️ **reiniciar conta** · 🗑️ **excluir conta** (LGPD).
- 📱 **PWA instalável** com layout mobile-first e navegação inferior.

## 🧱 Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend / SSR | Next.js 15 (App Router), React 19, TypeScript, Tailwind |
| Auth / DB | Supabase (Postgres + Auth + Row Level Security) |
| Mutações | Server Actions (`"use server"`) validadas com Zod |
| Leitura de fatura | Claude API (`@anthropic-ai/sdk`) com *structured outputs* |
| Hospedagem | Vercel (Hobby) |
| Notificações | Web Push (VAPID) + Service Worker |
| Agendamento | Vercel Cron (1×/dia) → `/api/cron/notifications` |
| Testes | Vitest (96 testes sobre a lógica pura de domínio) |

### Princípios que o código segue

- **Dinheiro em centavos (inteiros)** em toda a base — nunca float. Conversão só via
  [`src/lib/money.ts`](src/lib/money.ts).
- **Lógica de datas pura e determinística** — [`invoice.ts`](src/lib/invoice.ts) e
  [`installments.ts`](src/lib/installments.ts) operam sobre strings ISO, sem `Date.now()` nem
  timezone do ambiente. É o que os testes cobrem.
- **RLS é a barreira de segurança** — o client de usuário respeita RLS; o service role só é usado
  pelo cron e pela exclusão de conta.
- **A IA só sugere.** Toda decisão de valor, competência, categoria e deduplicação é determinística
  e testada em [`invoice-import.ts`](src/lib/invoice-import.ts).

📖 **As regras de negócio completas estão em [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md)**
(competência de fatura, parcelamento, assinaturas, dedupe da importação, notificações).

## 🚀 Rodando localmente

Pré-requisitos: **Node 24** (`.nvmrc`, mesma versão do CI), **pnpm 11+**, e (opcional) **Supabase CLI** para banco local.

```bash
pnpm install
cp .env.example .env.local        # preencha as variáveis (veja abaixo)
pnpm gen-icons                    # gera os ícones do PWA
pnpm dev                          # http://localhost:3000
```

### Variáveis de ambiente (`.env.local`)

| Variável | Onde obter |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (⚠️ só no servidor, nunca no client) |
| `NEXT_PUBLIC_SITE_URL` | URL pública do app (usada no link de recuperação de senha) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:seu@email.com` |
| `CRON_SECRET` | string aleatória longa — protege `/api/cron/notifications` |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) (⚠️ server-only) |

### Banco de dados

Aplique as migrations de [`supabase/migrations`](supabase/migrations) **em ordem** (0001 → 0015):

```bash
# opção A — Supabase CLI (recomendado)
supabase link --project-ref SEU_REF
supabase db push

# opção B — cole os arquivos .sql no SQL Editor do painel, na ordem numérica
```

| Migration | O que faz |
|---|---|
| `0001` | Schema inicial (valores em centavos, competência no dia 1) |
| `0002` | Políticas de **RLS** em todas as tabelas |
| `0003` | Trigger de provisionamento de novo usuário (profile + carteira + categorias) |
| `0004` | Recebimento recorrente por **N-ésimo dia útil** |
| `0005` | Backfill das categorias padrão para usuários antigos |
| `0006` | `transactions.statement_description` (nome bruto da fatura, base do dedupe) |
| `0007` | Reiniciar conta (`reset_account_data`) e excluir conta |
| `0008` | **Soft-delete** de parcelas (`deleted_at`) |
| `0009` | Contas fora do cartão: `pix`/`other`, `installments.due_date`, notificação `bills` |
| `0010` | **Escritas atômicas**: lançar/editar/importar gasto viram funções `security invoker` |
| `0011` | **FKs compostas** `(id, user_id)` — vínculo cross-tenant impossível no banco |
| `0012` | `invoice_import_log` — quota por usuário do endpoint de IA |
| `0013` | Unicidade de orçamento por categoria/competência (`nulls not distinct`) |
| `0014` | `incomes.recurring_end_month` — encerrar uma renda recorrente |
| `0015` | Índices das queries quentes (dashboard, recorrência, importação) |

Ao alterar o schema, adicione uma migration numerada **e** atualize
[`src/types/database.ts`](src/types/database.ts) — inclusive a chave `Functions` ao criar uma RPC.

> A `0011` **aborta** se encontrar vínculos cross-tenant preexistentes em colunas estruturais
> (cartão/conta/transação), pedindo revisão manual em vez de apagar dados. As FKs opcionais
> (categoria/assinatura) são normalizadas para `null` automaticamente.

## ☁️ Deploy (Vercel)

1. Importe o repositório na Vercel.
2. Configure as mesmas variáveis de ambiente do `.env.local` no projeto.
3. O [`vercel.json`](vercel.json) registra o **Cron diário** (`0 11 * * *` UTC ≈ 08:00 BRT) que
   dispara `/api/cron/notifications` com `Authorization: Bearer $CRON_SECRET`.

O CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) roda audit, typecheck, lint, testes e
build em todo PR; [`db-migrations.yml`](.github/workflows/db-migrations.yml) aplica as migrations na
`main`.

### Notificações no iPhone

O Web Push no iOS exige **iOS 16.4+** e a **PWA instalada na tela inicial**
(Compartilhar → Adicionar à Tela de Início). Não funciona no Safari comum nem em localhost.
No Android/desktop funciona direto no navegador.

## 🧪 Testes e qualidade

```bash
pnpm test        # testes unitários (Vitest) — 114 testes
pnpm test:watch  # Vitest em watch
pnpm typecheck   # TypeScript
pnpm lint        # ESLint (next)
```

Rode `pnpm typecheck` e `pnpm test` antes de considerar qualquer tarefa concluída.

## 🗺️ Status

As 4 fases do roadmap original estão **concluídas e em produção**, mais os incrementos posteriores:
importação de fatura por IA, contas fora do cartão, onboarding guiado, soft-delete com escopo e
troca de cartão de assinaturas.

Uma auditoria de fluxos, regras de negócio e segurança foi feita em **julho/2026**, e os 26 ajustes
priorizados em **[docs/PLANO-DE-IMPLEMENTACAO.md](docs/PLANO-DE-IMPLEMENTACAO.md)** foram aplicados.
O achado crítico era que o middleware interceptava `/api/cron/notifications` e o cron **nunca havia
executado** — nenhum push enviado e nenhuma renda recorrente materializada desde o deploy.

Depois de aplicar as migrations `0010`–`0015`, **rode o cron manualmente uma vez** e confira se não
houve duplicação de competências antes de confiar no agendamento:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://SEU-APP.vercel.app/api/cron/notifications
```

## 📚 Documentação

| Documento | Conteúdo |
|---|---|
| [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md) | Regras do domínio (`RN-01`…`RN-54`), invariantes e decisões explícitas de escopo |
| [docs/PLANO-DE-IMPLEMENTACAO.md](docs/PLANO-DE-IMPLEMENTACAO.md) | Auditoria e plano de ajustes priorizado (`AJ-01`…`AJ-26`) |
| [CLAUDE.md](CLAUDE.md) | Orientações para agentes trabalhando no repositório |

## 📄 Licença

MIT — veja [LICENSE](LICENSE).
