-- ============================================================================
-- Exclusão DEFINITIVA de gasto (hard delete), atômica.
--
-- O que existia até aqui era só o soft-delete por competência (`deleted_at`,
-- migration 0008): a parcela some do total e continua visível, esmaecida. Isso
-- resolve "esse mês não veio", mas não resolve "esse lançamento nunca deveria
-- ter existido" — e não havia nenhum caminho para apagar de verdade.
--
-- Por que uma função e não deletes soltos: PostgREST não dá transação. Apagar
-- parcelas, transações irmãs, o template recorrente e as capas de fatura órfãs
-- em quatro idas separadas deixa o dado meio-apagado se qualquer uma falhar.
--
-- `security invoker`: a RLS continua valendo (as policies de delete de 0002
-- escopam por `user_id = auth.uid()`), então esta função nunca alcança o dado
-- de outro usuário — mesmo com um id forjado no payload.
-- ============================================================================

create or replace function public.delete_expense_atomic(
  p_transaction_id    uuid,
  p_include_recurring boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_recurring_id  uuid;
  v_found         boolean;
  v_tx_ids        uuid[];
  -- Pares (card_id, reference_month) das parcelas apagadas: as capas de fatura
  -- dessas competências podem ter ficado sem nenhuma parcela.
  v_touched       jsonb := '[]'::jsonb;
  v_installments  int := 0;
  v_transactions  int := 0;
  v_invoices      int := 0;
  v_recurring     int := 0;
begin
  if v_user_id is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;

  -- A RLS já escopa o select: id de outro usuário simplesmente não retorna.
  select recurring_id, true into v_recurring_id, v_found
  from transactions
  where id = p_transaction_id;

  if not coalesce(v_found, false) then
    raise exception 'gasto não encontrado' using errcode = 'P0002';
  end if;

  -- Recorrente + "apagar a assinatura": o alvo passa a ser TODAS as ocorrências
  -- materializadas do template. Sem isso, apagar só o template deixaria as
  -- ocorrências como gastos avulsos sem vínculo (`recurring_id` vira null pelo
  -- `on delete set null` da FK) — que é o defeito que esta migration corrige.
  if p_include_recurring and v_recurring_id is not null then
    select array_agg(id) into v_tx_ids
    from transactions
    where recurring_id = v_recurring_id;
  else
    v_tx_ids := array[p_transaction_id];
  end if;

  -- Todas as parcelas, de TODAS as competências — inclusive as pagas e as já
  -- soft-deleted. "Para sempre" é isso; o escopo por mês continua no soft-delete.
  with removed as (
    delete from installments
    where transaction_id = any(v_tx_ids)
    returning card_id, reference_month
  )
  select
    count(*),
    coalesce(
      jsonb_agg(distinct jsonb_build_array(card_id, reference_month))
        filter (where card_id is not null),
      '[]'::jsonb
    )
  into v_installments, v_touched
  from removed;

  delete from transactions where id = any(v_tx_ids);
  get diagnostics v_transactions = row_count;

  if p_include_recurring and v_recurring_id is not null then
    delete from recurring_expenses where id = v_recurring_id;
    get diagnostics v_recurring = row_count;
  end if;

  -- Capa de fatura que ficou sem nenhuma parcela vira lixo na tela do cartão.
  -- Fatura PAGA nunca é apagada: marcar como paga é registro do usuário, não
  -- resíduo de cálculo.
  delete from invoices i
  where i.status <> 'paid'
    and (i.card_id, i.reference_month) in (
      select (e ->> 0)::uuid, (e ->> 1)::date
      from jsonb_array_elements(v_touched) e
    )
    and not exists (
      select 1 from installments x
      where x.card_id = i.card_id
        and x.reference_month = i.reference_month
    );
  get diagnostics v_invoices = row_count;

  return jsonb_build_object(
    'installments', v_installments,
    'transactions', v_transactions,
    'invoices',     v_invoices,
    'recurring',    v_recurring
  );
end;
$$;

revoke execute on function public.delete_expense_atomic(uuid, boolean) from public, anon, service_role;
grant  execute on function public.delete_expense_atomic(uuid, boolean) to authenticated;
