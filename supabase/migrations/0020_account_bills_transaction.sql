-- ============================================================================
-- 0020: `account_bills` passa a devolver o id da TRANSAÇÃO.
--
-- A tela de contas não tinha como abrir o lançamento — o item não era clicável —
-- então não havia caminho para editar nem excluir uma conta fora do cartão. O
-- link do detalhe do gasto é por transação, não por parcela, e a RPC só
-- devolvia o id da parcela.
--
-- `drop` antes do `create`: acrescentar uma coluna muda o tipo de retorno, e
-- `create or replace` recusa isso ("cannot change return type of existing
-- function").
--
-- Os grants seguem o formato corrigido pela 0019 — revogar também de `anon` e
-- `service_role`, e não só de `public`.
-- ============================================================================

drop function if exists public.account_bills(date);

create or replace function public.account_bills(p_ref_month date)
returns table (
  id             uuid,
  transaction_id uuid,
  amount_cents   bigint,
  due_date       date,
  status         installment_status,
  description    text,
  kind           expense_kind,
  account_name   text,
  account_color  text
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    i.id, i.transaction_id, i.amount_cents, i.due_date, i.status,
    t.description, t.kind,
    a.name, a.color
  from installments i
  join transactions t on t.id = i.transaction_id
  left join accounts a on a.id = i.account_id
  where i.reference_month = p_ref_month
    and i.account_id is not null
    and i.deleted_at is null;
$$;

revoke execute on function public.account_bills(date) from public, anon, service_role;
grant  execute on function public.account_bills(date) to authenticated;
