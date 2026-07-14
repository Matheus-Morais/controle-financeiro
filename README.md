# 💸 Controle Financeiro

Aplicação **mobile-first** (PWA) para controle financeiro pessoal — substitui a velha planilha.
Cadastre cartões, lance gastos à vista/parcelados/recorrentes, acompanhe a fatura de cada cartão
mês a mês e receba lembretes por notificação para marcar boletos pagos e atualizar seus gastos.

> Stack 100% em free-tier: **Next.js + Supabase + Vercel**.

## ✨ Funcionalidades

- 🔐 **Login por usuário** (Supabase Auth) com isolamento total de dados (RLS).
- 💳 **Cartões de crédito** com dia de **fechamento** e **vencimento**.
- 🧾 **Gastos**: à vista, **parcelado** (parcelas geradas automaticamente nas competências certas)
  e **recorrente** (assinaturas).
- 📆 **Visão mensal por cartão** com abas **Parcelado / Recorrente / À vista** e "faltam X de N".
- ✅ **Marcar fatura/boleto como pago**.
- 💰 **Recebimentos** do mês (renda × gastos).
- 🔔 **Notificações Web Push**: lembrete no início do mês (marcar boletos) e lembrete semanal
  configurável (atualizar gastos).
- 📊 **Dashboard**, **categorias**, **orçamento/metas** e **exportar CSV** (fases seguintes).
- 📱 **PWA instalável** com layout mobile-first e navegação inferior.

## 🧱 Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend / SSR | Next.js 15 (App Router), TypeScript, Tailwind |
| Auth / DB | Supabase (Postgres + Auth + Row Level Security) |
| Hospedagem | Vercel (Hobby) |
| Notificações | Web Push (VAPID) + Service Worker |
| Agendamento | Vercel Cron (1×/dia) → `/api/cron/notifications` |
| Testes | Vitest (lógica de fatura/parcelas) |

Valores monetários são tratados em **centavos (inteiros)** em toda a base para evitar erros de
ponto flutuante. A lógica pura de **competência de fatura** e **geração de parcelas** vive em
[`src/lib/invoice.ts`](src/lib/invoice.ts) e [`src/lib/installments.ts`](src/lib/installments.ts),
coberta por testes.

## 🚀 Rodando localmente

Pré-requisitos: **Node 20+**, **pnpm**, e (opcional) **Supabase CLI** para banco local.

```bash
pnpm install
cp .env.example .env.local        # preencha as variáveis (veja abaixo)
node scripts/generate-icons.mjs   # gera ícones PWA placeholder
pnpm dev                          # http://localhost:3000
```

### Variáveis de ambiente (`.env.local`)

| Variável | Onde obter |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | idem (⚠️ só no servidor) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:seu@email.com` |
| `CRON_SECRET` | string aleatória longa |

### Banco de dados

Aplique as migrations de [`supabase/migrations`](supabase/migrations) no seu projeto Supabase:

```bash
# opção A — Supabase CLI (recomendado)
supabase link --project-ref SEU_REF
supabase db push

# opção B — cole os arquivos .sql no SQL Editor do painel, em ordem (0001, 0002, 0003)
```

As migrations criam o schema, as políticas de **RLS** e um gatilho que provisiona
profile + categorias + carteira padrão a cada novo usuário.

## ☁️ Deploy (Vercel)

1. Importe o repositório na Vercel.
2. Configure as mesmas variáveis de ambiente do `.env.local` no projeto.
3. O `vercel.json` já registra o **Cron diário** (`0 11 * * *` UTC ≈ 08:00 BRT) que dispara
   `/api/cron/notifications`. A Vercel envia `Authorization: Bearer $CRON_SECRET`.

### Notificações no iPhone
O Web Push no iOS exige **iOS 16.4+** e a **PWA instalada na tela inicial**
(Compartilhar → Adicionar à Tela de Início). No Android/desktop funciona direto no navegador.

## 🧪 Testes e qualidade

```bash
pnpm test        # testes unitários (Vitest)
pnpm typecheck   # TypeScript
pnpm lint        # ESLint (next)
```

## 🗺️ Roadmap

- **Fase 0 — Fundação** ✅ auth, shell PWA, lógica de fatura/parcelas, cron de notificações, CI.
- **Fase 1 — MVP** cartões, lançamento de gastos (à vista/parcelado), visão do cartão com abas,
  parcelas restantes, marcar fatura paga.
- **Fase 2 — Renda e recorrência** recebimentos, assinaturas, dashboard básico.
- **Fase 3 — Notificações** ativação de push na tela de Ajustes (já cabeada) + refino.
- **Fase 4 — Extras** categorias, orçamento/metas, gráficos, exportar CSV.

## 📄 Licença

MIT — veja [LICENSE](LICENSE).
