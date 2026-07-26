-- ============================================================================
-- 0011: FKs compostas — vínculo cross-tenant impossível no nível do banco (AJ-03).
--
-- A RLS aprova um insert cujo `user_id` é o do requisitante MESMO que as FKs
-- apontem para registros de outro usuário: a policy só olha a linha inserida,
-- nunca o dono do alvo da FK. A validação na aplicação (0010) fecha os fluxos
-- conhecidos; esta migration fecha o furo de vez, para qualquer caminho futuro.
--
-- Truque: uma unique (id, user_id) no pai permite que a FK carregue o user_id.
-- Como o filho já tem `user_id not null`, referenciar (fk_id, user_id) obriga o
-- alvo a ser do mesmo dono.
--
-- `on delete set null (coluna)` (Postgres 15+) é necessário nas FKs opcionais:
-- sem a lista de colunas o Postgres tentaria anular também o user_id, que é
-- `not null`.
-- ============================================================================

-- ── auditoria: vínculos cross-tenant preexistentes ─────────────────────────
-- As FKs opcionais (categoria/assinatura) são normalizadas para null; as
-- estruturais (cartão/conta/transação) não têm correção automática segura, e a
-- migration aborta pedindo revisão manual em vez de apagar dados do usuário.
do $$
declare
  v_bad integer;
begin
  update transactions t set category_id = null
  where t.category_id is not null
    and not exists (select 1 from categories c where c.id = t.category_id and c.user_id = t.user_id);

  update transactions t set recurring_id = null
  where t.recurring_id is not null
    and not exists (select 1 from recurring_expenses r where r.id = t.recurring_id and r.user_id = t.user_id);

  update recurring_expenses r set category_id = null
  where r.category_id is not null
    and not exists (select 1 from categories c where c.id = r.category_id and c.user_id = r.user_id);

  delete from budgets b
  where b.category_id is not null
    and not exists (select 1 from categories c where c.id = b.category_id and c.user_id = b.user_id);

  select
    (select count(*) from transactions t where t.card_id is not null
       and not exists (select 1 from cards c where c.id = t.card_id and c.user_id = t.user_id))
  + (select count(*) from transactions t where t.account_id is not null
       and not exists (select 1 from accounts a where a.id = t.account_id and a.user_id = t.user_id))
  + (select count(*) from installments i where i.card_id is not null
       and not exists (select 1 from cards c where c.id = i.card_id and c.user_id = i.user_id))
  + (select count(*) from installments i where i.account_id is not null
       and not exists (select 1 from accounts a where a.id = i.account_id and a.user_id = i.user_id))
  + (select count(*) from installments i
       where not exists (select 1 from transactions t where t.id = i.transaction_id and t.user_id = i.user_id))
  + (select count(*) from invoices v
       where not exists (select 1 from cards c where c.id = v.card_id and c.user_id = v.user_id))
  + (select count(*) from recurring_expenses r where r.card_id is not null
       and not exists (select 1 from cards c where c.id = r.card_id and c.user_id = r.user_id))
  + (select count(*) from recurring_expenses r where r.account_id is not null
       and not exists (select 1 from accounts a where a.id = r.account_id and a.user_id = r.user_id))
  into v_bad;

  if v_bad > 0 then
    raise exception
      'Há % vínculo(s) cross-tenant em colunas estruturais. Revise manualmente antes de aplicar esta migration.',
      v_bad;
  end if;
end $$;

-- ── uniques que carregam o dono ────────────────────────────────────────────
alter table cards              add constraint cards_id_user_uk        unique (id, user_id);
alter table accounts           add constraint accounts_id_user_uk     unique (id, user_id);
alter table categories         add constraint categories_id_user_uk   unique (id, user_id);
alter table recurring_expenses add constraint recurring_id_user_uk    unique (id, user_id);
alter table transactions       add constraint transactions_id_user_uk unique (id, user_id);

-- ── transactions ───────────────────────────────────────────────────────────
alter table transactions
  drop constraint if exists transactions_card_id_fkey,
  drop constraint if exists transactions_account_id_fkey,
  drop constraint if exists transactions_category_id_fkey,
  drop constraint if exists transactions_recurring_id_fkey,
  add constraint transactions_card_fk
    foreign key (card_id, user_id) references cards (id, user_id) on delete cascade,
  add constraint transactions_account_fk
    foreign key (account_id, user_id) references accounts (id, user_id) on delete cascade,
  add constraint transactions_category_fk
    foreign key (category_id, user_id) references categories (id, user_id)
    on delete set null (category_id),
  add constraint transactions_recurring_fk
    foreign key (recurring_id, user_id) references recurring_expenses (id, user_id)
    on delete set null (recurring_id);

-- ── installments ───────────────────────────────────────────────────────────
alter table installments
  drop constraint if exists installments_transaction_id_fkey,
  drop constraint if exists installments_card_id_fkey,
  drop constraint if exists installments_account_id_fkey,
  add constraint installments_transaction_fk
    foreign key (transaction_id, user_id) references transactions (id, user_id) on delete cascade,
  add constraint installments_card_fk
    foreign key (card_id, user_id) references cards (id, user_id) on delete cascade,
  add constraint installments_account_fk
    foreign key (account_id, user_id) references accounts (id, user_id) on delete cascade;

-- ── invoices ───────────────────────────────────────────────────────────────
alter table invoices
  drop constraint if exists invoices_card_id_fkey,
  add constraint invoices_card_fk
    foreign key (card_id, user_id) references cards (id, user_id) on delete cascade;

-- ── recurring_expenses ─────────────────────────────────────────────────────
alter table recurring_expenses
  drop constraint if exists recurring_expenses_card_id_fkey,
  drop constraint if exists recurring_expenses_account_id_fkey,
  drop constraint if exists recurring_expenses_category_id_fkey,
  add constraint recurring_card_fk
    foreign key (card_id, user_id) references cards (id, user_id) on delete cascade,
  add constraint recurring_account_fk
    foreign key (account_id, user_id) references accounts (id, user_id) on delete cascade,
  add constraint recurring_category_fk
    foreign key (category_id, user_id) references categories (id, user_id)
    on delete set null (category_id);

-- ── budgets ────────────────────────────────────────────────────────────────
alter table budgets
  drop constraint if exists budgets_category_id_fkey,
  add constraint budgets_category_fk
    foreign key (category_id, user_id) references categories (id, user_id) on delete cascade;
