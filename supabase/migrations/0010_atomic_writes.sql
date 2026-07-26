-- ============================================================================
-- 0010: escritas multi-tabela atômicas (AJ-02) + validação de FK cross-tenant
--       na camada da aplicação (AJ-03, camada 1).
--
-- Cada fluxo de gravação (lançar gasto, editar gasto, importar fatura) fazia
-- 3–4 chamadas PostgREST independentes. Sem transação, uma falha no meio deixa
-- o banco inconsistente — o caso mais grave é a EDIÇÃO, que apaga as parcelas
-- antes de reinserir: se o insert falha, o gasto fica sem nenhuma parcela e
-- some de todas as faturas e relatórios.
--
-- Mesmo padrão de reset_account_data() (0007): `security invoker` para a RLS
-- continuar sendo a barreira (RN-06), e a função inteira roda numa transação.
--
-- Além da atomicidade, as funções fecham dois furos:
--   1. `user_id` é sempre auth.uid() — o valor vindo do client é ignorado.
--   2. Toda FK (card/account/category/recurring) é checada contra o dono. A RLS
--      só olha a linha inserida, então aceitaria um category_id de outro
--      usuário; o `exists` abaixo (já filtrado por RLS) rejeita.
-- ============================================================================

-- ── helpers de validação de posse ──────────────────────────────────────────
-- `select` sob RLS já devolve só as linhas do próprio usuário; o filtro
-- explícito por user_id é redundante de propósito (defesa em profundidade).

create or replace function public.assert_owned_refs(
  p_user_id     uuid,
  p_card_ids    uuid[],
  p_account_ids uuid[],
  p_category_ids uuid[],
  p_recurring_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from unnest(coalesce(p_card_ids, '{}'::uuid[])) as t(ref_id)
    where t.ref_id is not null
      and not exists (select 1 from cards c where c.id = t.ref_id and c.user_id = p_user_id)
  ) then
    raise exception 'cartão inexistente ou de outro usuário' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_account_ids, '{}'::uuid[])) as t(ref_id)
    where t.ref_id is not null
      and not exists (select 1 from accounts a where a.id = t.ref_id and a.user_id = p_user_id)
  ) then
    raise exception 'conta inexistente ou de outro usuário' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_category_ids, '{}'::uuid[])) as t(ref_id)
    where t.ref_id is not null
      and not exists (select 1 from categories c where c.id = t.ref_id and c.user_id = p_user_id)
  ) then
    raise exception 'categoria inexistente ou de outro usuário' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_recurring_ids, '{}'::uuid[])) as t(ref_id)
    where t.ref_id is not null
      and not exists (
        select 1 from recurring_expenses r where r.id = t.ref_id and r.user_id = p_user_id
      )
  ) then
    raise exception 'assinatura inexistente ou de outro usuário' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.assert_owned_refs(uuid, uuid[], uuid[], uuid[], uuid[]) to authenticated;

-- ── lançar gasto (à vista / parcelado) ─────────────────────────────────────
-- p_transaction: objeto com as colunas da transação (sem user_id/id).
-- p_installments: array de parcelas (sem user_id/transaction_id — a função liga).
-- p_invoices: array de faturas a garantir (só cartão); nunca reabre fatura paga.
create or replace function public.create_expense_atomic(
  p_transaction  jsonb,
  p_installments jsonb,
  p_invoices     jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx_id   uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform public.assert_owned_refs(
    v_user_id,
    array[(p_transaction ->> 'card_id')::uuid],
    array[(p_transaction ->> 'account_id')::uuid],
    array[(p_transaction ->> 'category_id')::uuid],
    array[]::uuid[]
  );

  insert into transactions (
    user_id, card_id, account_id, category_id, description, kind,
    total_amount_cents, purchase_date, installments_count, notes
  )
  values (
    v_user_id,
    (p_transaction ->> 'card_id')::uuid,
    (p_transaction ->> 'account_id')::uuid,
    (p_transaction ->> 'category_id')::uuid,
    p_transaction ->> 'description',
    (p_transaction ->> 'kind')::expense_kind,
    (p_transaction ->> 'total_amount_cents')::bigint,
    (p_transaction ->> 'purchase_date')::date,
    (p_transaction ->> 'installments_count')::smallint,
    p_transaction ->> 'notes'
  )
  returning id into v_tx_id;

  insert into installments (
    user_id, transaction_id, card_id, account_id, number,
    amount_cents, reference_month, due_date, status
  )
  select
    v_user_id, v_tx_id, x.card_id, x.account_id, x.number,
    x.amount_cents, x.reference_month, x.due_date, coalesce(x.status, 'open')
  from jsonb_to_recordset(p_installments) as x(
    card_id uuid, account_id uuid, number smallint, amount_cents bigint,
    reference_month date, due_date date, status installment_status
  );

  insert into invoices (user_id, card_id, reference_month, closing_date, due_date, status)
  select v_user_id, x.card_id, x.reference_month, x.closing_date, x.due_date, 'open'
  from jsonb_to_recordset(coalesce(p_invoices, '[]'::jsonb)) as x(
    card_id uuid, reference_month date, closing_date date, due_date date
  )
  on conflict (card_id, reference_month) do nothing;

  return v_tx_id;
end;
$$;

grant execute on function public.create_expense_atomic(jsonb, jsonb, jsonb) to authenticated;

-- ── editar gasto (regenera as parcelas) ────────────────────────────────────
-- Preserva, POR COMPETÊNCIA, o `status` (paid) e o `deleted_at` (soft-delete da
-- 0008) das parcelas antigas — o delete físico anterior descartava ambos.
-- Retorna quantas competências PAGAS deixaram de existir no novo cronograma,
-- para a UI avisar que um registro de pagamento foi descartado.
create or replace function public.update_expense_atomic(
  p_transaction_id uuid,
  p_transaction    jsonb,
  p_installments   jsonb,
  p_invoices       jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_prev        jsonb;
  v_dropped     integer;
  v_new_months  date[];
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from transactions t where t.id = p_transaction_id and t.user_id = v_user_id
  ) then
    raise exception 'gasto inexistente ou de outro usuário' using errcode = '42501';
  end if;

  perform public.assert_owned_refs(
    v_user_id,
    array[(p_transaction ->> 'card_id')::uuid],
    array[(p_transaction ->> 'account_id')::uuid],
    array[(p_transaction ->> 'category_id')::uuid],
    array[]::uuid[]
  );

  -- Estado anterior por competência (uma parcela por mês; `distinct on` é
  -- defensivo e prefere a viva, e entre as vivas a paga).
  select jsonb_object_agg(m, jsonb_build_object('status', st, 'deleted_at', dl))
  into v_prev
  from (
    select distinct on (reference_month)
           reference_month::text as m,
           status::text          as st,
           deleted_at            as dl
    from installments
    where transaction_id = p_transaction_id
    order by reference_month, (deleted_at is not null), (status = 'paid') desc
  ) t;
  v_prev := coalesce(v_prev, '{}'::jsonb);

  select array_agg(distinct x.reference_month)
  into v_new_months
  from jsonb_to_recordset(p_installments) as x(reference_month date);

  -- Competências pagas que somem do novo cronograma (ex.: parcelamento encurtado).
  select count(*)
  into v_dropped
  from jsonb_each(v_prev) as e(k, v)
  where v ->> 'status' = 'paid'
    and v ->> 'deleted_at' is null
    and not (k::date = any(coalesce(v_new_months, '{}'::date[])));

  update transactions
  set card_id            = (p_transaction ->> 'card_id')::uuid,
      account_id         = (p_transaction ->> 'account_id')::uuid,
      category_id        = (p_transaction ->> 'category_id')::uuid,
      description        = p_transaction ->> 'description',
      kind               = (p_transaction ->> 'kind')::expense_kind,
      total_amount_cents = (p_transaction ->> 'total_amount_cents')::bigint,
      purchase_date      = (p_transaction ->> 'purchase_date')::date,
      installments_count = (p_transaction ->> 'installments_count')::smallint,
      notes              = p_transaction ->> 'notes'
  where id = p_transaction_id;

  delete from installments where transaction_id = p_transaction_id;

  insert into installments (
    user_id, transaction_id, card_id, account_id, number,
    amount_cents, reference_month, due_date, status, deleted_at
  )
  select
    v_user_id, p_transaction_id, x.card_id, x.account_id, x.number,
    x.amount_cents, x.reference_month, x.due_date,
    coalesce((v_prev -> x.reference_month::text ->> 'status')::installment_status, 'open'),
    (v_prev -> x.reference_month::text ->> 'deleted_at')::timestamptz
  from jsonb_to_recordset(p_installments) as x(
    card_id uuid, account_id uuid, number smallint, amount_cents bigint,
    reference_month date, due_date date
  );

  insert into invoices (user_id, card_id, reference_month, closing_date, due_date, status)
  select v_user_id, x.card_id, x.reference_month, x.closing_date, x.due_date, 'open'
  from jsonb_to_recordset(coalesce(p_invoices, '[]'::jsonb)) as x(
    card_id uuid, reference_month date, closing_date date, due_date date
  )
  on conflict (card_id, reference_month) do nothing;

  return v_dropped;
end;
$$;

grant execute on function public.update_expense_atomic(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ── importar fatura (lote) ─────────────────────────────────────────────────
-- Os ids das transações e das assinaturas já vêm gerados pela aplicação, o que
-- liga parcela↔transação sem round-trip. As assinaturas entram primeiro porque
-- transactions.recurring_id é FK para elas.
create or replace function public.import_invoice_atomic(
  p_recurrings   jsonb,
  p_transactions jsonb,
  p_installments jsonb,
  p_invoices     jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count   integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform public.assert_owned_refs(
    v_user_id,
    (select array_agg(x.card_id) from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(card_id uuid)),
    (select array_agg(x.account_id) from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(account_id uuid)),
    (select array_agg(x.category_id) from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(category_id uuid)),
    array[]::uuid[]
  );

  insert into recurring_expenses (
    id, user_id, card_id, account_id, category_id, description,
    amount_cents, billing_day, start_month, end_month, active
  )
  select
    x.id, v_user_id, x.card_id, x.account_id, x.category_id, x.description,
    x.amount_cents, x.billing_day, x.start_month, x.end_month, coalesce(x.active, true)
  from jsonb_to_recordset(coalesce(p_recurrings, '[]'::jsonb)) as x(
    id uuid, card_id uuid, account_id uuid, category_id uuid, description text,
    amount_cents bigint, billing_day smallint, start_month date, end_month date, active boolean
  );

  -- Só depois das assinaturas novas existirem é que dá para validar o vínculo.
  perform public.assert_owned_refs(
    v_user_id, array[]::uuid[], array[]::uuid[], array[]::uuid[],
    (select array_agg(x.recurring_id) from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(recurring_id uuid))
  );

  insert into transactions (
    id, user_id, card_id, account_id, category_id, recurring_id, description,
    statement_description, kind, total_amount_cents, purchase_date, installments_count
  )
  select
    x.id, v_user_id, x.card_id, x.account_id, x.category_id, x.recurring_id, x.description,
    x.statement_description, x.kind, x.total_amount_cents, x.purchase_date, x.installments_count
  from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(
    id uuid, card_id uuid, account_id uuid, category_id uuid, recurring_id uuid,
    description text, statement_description text, kind expense_kind,
    total_amount_cents bigint, purchase_date date, installments_count smallint
  );
  get diagnostics v_count = row_count;

  insert into installments (
    user_id, transaction_id, card_id, account_id, number,
    amount_cents, reference_month, due_date, status
  )
  select
    v_user_id, x.transaction_id, x.card_id, x.account_id, x.number,
    x.amount_cents, x.reference_month, x.due_date, coalesce(x.status, 'open')
  from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(
    transaction_id uuid, card_id uuid, account_id uuid, number smallint,
    amount_cents bigint, reference_month date, due_date date, status installment_status
  );

  insert into invoices (user_id, card_id, reference_month, closing_date, due_date, status)
  select v_user_id, x.card_id, x.reference_month, x.closing_date, x.due_date, 'open'
  from jsonb_to_recordset(coalesce(p_invoices, '[]'::jsonb)) as x(
    card_id uuid, reference_month date, closing_date date, due_date date
  )
  on conflict (card_id, reference_month) do nothing;

  return v_count;
end;
$$;

grant execute on function public.import_invoice_atomic(jsonb, jsonb, jsonb, jsonb) to authenticated;
