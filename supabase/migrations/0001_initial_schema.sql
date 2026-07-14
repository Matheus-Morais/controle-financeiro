-- ============================================================================
-- Controle Financeiro — Schema inicial
-- Postgres / Supabase. Valores monetários em CENTAVOS (bigint) para casar com
-- a lógica de domínio (src/lib). Datas de competência (`reference_month`) são
-- sempre o 1º dia do mês.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── ENUMs ───────────────────────────────────────────────────────────────────
create type account_type   as enum ('wallet', 'checking', 'cash');
create type expense_kind    as enum ('single', 'installment', 'recurring');
create type installment_status as enum ('open', 'paid');
create type invoice_status  as enum ('open', 'paid');
create type notification_type as enum ('monthly', 'weekly');

-- ── profiles ─────────────────────────────────────────────────────────────────
create table profiles (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  display_name            text,
  timezone                text        not null default 'America/Sao_Paulo',
  currency                text        not null default 'BRL',
  weekly_reminder_enabled boolean     not null default true,
  weekly_reminder_day     smallint    not null default 1 check (weekly_reminder_day between 0 and 6), -- 0=dom
  monthly_reminder_enabled boolean    not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ── accounts (carteira geral: dinheiro/PIX/débito) ──────────────────────────
create table accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  type       account_type not null default 'wallet',
  color      text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index accounts_user_idx on accounts (user_id);

-- ── cards ────────────────────────────────────────────────────────────────────
create table cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  brand        text,
  closing_day  smallint not null check (closing_day between 1 and 31),
  due_day      smallint not null check (due_day between 1 and 31),
  credit_limit_cents bigint check (credit_limit_cents >= 0),
  color        text,
  last_four    text check (last_four ~ '^[0-9]{4}$'),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index cards_user_idx on cards (user_id);

-- ── categories ───────────────────────────────────────────────────────────────
create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  icon       text,
  color      text,
  created_at timestamptz not null default now()
);
create index categories_user_idx on categories (user_id);

-- ── recurring_expenses (assinaturas) ────────────────────────────────────────
create table recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  card_id      uuid references cards (id) on delete cascade,
  account_id   uuid references accounts (id) on delete cascade,
  category_id  uuid references categories (id) on delete set null,
  description  text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  billing_day  smallint not null check (billing_day between 1 and 31),
  start_month  date not null,
  end_month    date,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  -- exatamente uma origem (cartão OU conta)
  constraint recurring_one_source check ((card_id is null) <> (account_id is null))
);
create index recurring_user_idx on recurring_expenses (user_id);

-- ── transactions (o gasto) ───────────────────────────────────────────────────
create table transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  card_id            uuid references cards (id) on delete cascade,
  account_id         uuid references accounts (id) on delete cascade,
  category_id        uuid references categories (id) on delete set null,
  recurring_id       uuid references recurring_expenses (id) on delete set null,
  description        text not null,
  kind               expense_kind not null,
  total_amount_cents bigint not null check (total_amount_cents >= 0),
  purchase_date      date not null,
  installments_count smallint not null default 1 check (installments_count >= 1),
  notes              text,
  created_at         timestamptz not null default now(),
  constraint tx_one_source check ((card_id is null) <> (account_id is null))
);
create index transactions_user_idx on transactions (user_id);
create index transactions_card_idx on transactions (card_id);

-- ── installments (parcelas — coração do controle mensal) ────────────────────
create table installments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  transaction_id  uuid not null references transactions (id) on delete cascade,
  card_id         uuid references cards (id) on delete cascade, -- denormalizado p/ query
  account_id      uuid references accounts (id) on delete cascade,
  number          smallint not null check (number >= 1),
  amount_cents    bigint not null check (amount_cents >= 0),
  reference_month date not null, -- sempre dia 01
  status          installment_status not null default 'open',
  created_at      timestamptz not null default now()
);
create index installments_user_idx on installments (user_id);
create index installments_card_month_idx on installments (card_id, reference_month);
create index installments_tx_idx on installments (transaction_id);

-- ── invoices (faturas — marcar boleto pago) ─────────────────────────────────
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  card_id         uuid not null references cards (id) on delete cascade,
  reference_month date not null,
  closing_date    date not null,
  due_date        date not null,
  status          invoice_status not null default 'open',
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (card_id, reference_month)
);
create index invoices_user_idx on invoices (user_id);

-- ── incomes (recebimentos) ───────────────────────────────────────────────────
create table incomes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  description     text not null,
  amount_cents    bigint not null check (amount_cents >= 0),
  receipt_date    date not null,
  reference_month date not null,
  is_recurring    boolean not null default false,
  recurring_day   smallint check (recurring_day between 1 and 31),
  created_at      timestamptz not null default now()
);
create index incomes_user_month_idx on incomes (user_id, reference_month);

-- ── budgets (metas) ──────────────────────────────────────────────────────────
create table budgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  category_id     uuid references categories (id) on delete cascade, -- null = geral
  reference_month date, -- null = recorrente (vale todo mês)
  limit_cents     bigint not null check (limit_cents >= 0),
  created_at      timestamptz not null default now()
);
create index budgets_user_idx on budgets (user_id);

-- ── push_subscriptions ───────────────────────────────────────────────────────
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_user_idx on push_subscriptions (user_id);

-- ── notification_log (idempotência dos disparos) ────────────────────────────
create table notification_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  type      notification_type not null,
  sent_for  date not null, -- dia (weekly) ou 1º dia do mês (monthly)
  sent_at   timestamptz not null default now(),
  unique (user_id, type, sent_for)
);
