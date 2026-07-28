-- ============================================================================
-- 0016: materialização de recorrentes atômica + validação de posse das parcelas.
--
-- (1) A materialização de assinaturas (lib/recurring.ts) era o ÚNICO fluxo de
--     criação de gasto que ainda encadeava inserts soltos: transação, parcela e
--     capa de fatura em três chamadas PostgREST independentes, uma por
--     assinatura. Uma falha entre elas deixava a transação órfã (sem parcela),
--     invisível em faturas e relatórios — e, como a idempotência é por parcela
--     na competência (RN-24), o próximo tick criava OUTRA órfã, sem nunca
--     convergir. Aqui o lote inteiro vira uma transação no Postgres.
--
--     Diferente das funções da 0010, esta recebe `p_user_id`: o cron roda com o
--     service client, sem sessão, então `auth.uid()` é nulo. Quando HÁ sessão
--     (páginas e actions), o id precisa ser o do próprio usuário.
--
-- (2) As três funções da 0010 validavam a posse dos ids da TRANSAÇÃO, mas não
--     dos que vêm em `p_installments`. A FK composta da 0011 já barra o vínculo
--     cross-tenant no banco; a checagem explícita fecha a mesma porta uma camada
--     antes, com mensagem de erro própria (RN-44, defesa em profundidade).
-- ============================================================================

-- ── materializar assinaturas (lote de um usuário) ──────────────────────────
create or replace function public.materialize_recurring_atomic(
  p_user_id      uuid,
  p_transactions jsonb,
  p_installments jsonb,
  p_invoices     jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_count  integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id é obrigatório' using errcode = '22004';
  end if;
  -- Com sessão, só o próprio usuário. Sem sessão é o cron (service role), que
  -- já é confiável por definição — e a RLS não se aplica a ele.
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'usuário inválido' using errcode = '42501';
  end if;

  perform public.assert_owned_refs(
    p_user_id,
    (select array_agg(x.card_id) from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(card_id uuid)),
    (select array_agg(x.account_id) from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(account_id uuid)),
    (select array_agg(x.category_id) from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(category_id uuid)),
    (select array_agg(x.recurring_id) from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(recurring_id uuid))
  );
  perform public.assert_owned_refs(
    p_user_id,
    (select array_agg(x.card_id) from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(card_id uuid)),
    (select array_agg(x.account_id) from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(account_id uuid)),
    array[]::uuid[],
    array[]::uuid[]
  );

  -- Ids pré-gerados pela aplicação ligam parcela↔transação sem round-trip.
  insert into transactions (
    id, user_id, card_id, account_id, category_id, recurring_id, description,
    kind, total_amount_cents, purchase_date, installments_count
  )
  select
    x.id, p_user_id, x.card_id, x.account_id, x.category_id, x.recurring_id, x.description,
    x.kind, x.total_amount_cents, x.purchase_date, x.installments_count
  from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(
    id uuid, card_id uuid, account_id uuid, category_id uuid, recurring_id uuid,
    description text, kind expense_kind, total_amount_cents bigint,
    purchase_date date, installments_count smallint
  );
  get diagnostics v_count = row_count;

  insert into installments (
    user_id, transaction_id, card_id, account_id, number,
    amount_cents, reference_month, due_date, status
  )
  select
    p_user_id, x.transaction_id, x.card_id, x.account_id, x.number,
    x.amount_cents, x.reference_month, x.due_date, coalesce(x.status, 'open')
  from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(
    transaction_id uuid, card_id uuid, account_id uuid, number smallint,
    amount_cents bigint, reference_month date, due_date date, status installment_status
  );

  insert into invoices (user_id, card_id, reference_month, closing_date, due_date, status)
  select p_user_id, x.card_id, x.reference_month, x.closing_date, x.due_date, 'open'
  from jsonb_to_recordset(coalesce(p_invoices, '[]'::jsonb)) as x(
    card_id uuid, reference_month date, closing_date date, due_date date
  )
  on conflict (card_id, reference_month) do nothing;

  return v_count;
end;
$$;

grant execute on function public.materialize_recurring_atomic(uuid, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- ── 0010 revisitada: posse também dos ids das PARCELAS ─────────────────────
-- Corpos idênticos aos da 0010, com um `assert_owned_refs` extra sobre
-- `p_installments`. Nenhuma outra mudança de comportamento.

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
  perform public.assert_owned_refs(
    v_user_id,
    (select array_agg(x.card_id) from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(card_id uuid)),
    (select array_agg(x.account_id) from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(account_id uuid)),
    array[]::uuid[],
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
  perform public.assert_owned_refs(
    v_user_id,
    (select array_agg(x.card_id) from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(card_id uuid)),
    (select array_agg(x.account_id) from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(account_id uuid)),
    array[]::uuid[],
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
  perform public.assert_owned_refs(
    v_user_id,
    (select array_agg(x.card_id) from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(card_id uuid)),
    (select array_agg(x.account_id) from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(account_id uuid)),
    array[]::uuid[],
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
