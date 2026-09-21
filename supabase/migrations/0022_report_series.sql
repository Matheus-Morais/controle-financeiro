-- ============================================================================
-- 0022: séries para a tela de gráficos.
--
-- O dashboard mostra o mês corrente; a tela de gráficos olha o histórico. As
-- duas agregações abaixo são o que faltava para isso caber em poucas idas ao
-- banco: entradas por competência (espelho de `monthly_totals`, que só cobre
-- saídas) e gasto por cartão no mês.
--
-- Sem a primeira, montar "entradas × saídas" de doze meses custaria doze
-- chamadas de `month_cash_flow` — uma por mês, em série.
--
-- Mesmo contrato das funções da 0018: `security invoker` (a RLS escopa por
-- usuário) e `stable`. Os grants seguem o formato corrigido pela 0019 — revogar
-- também de `anon` e `service_role`, e não só de `public`.
-- ============================================================================

-- ── Total recebido por competência ─────────────────────────────────────────
-- Meses sem recebimento não voltam; quem chama preenche com zero, como já faz
-- com `monthly_totals`.
create or replace function public.monthly_income_totals(p_months date[])
returns table (reference_month date, cents bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select n.reference_month, sum(n.amount_cents)::bigint
  from incomes n
  where n.reference_month = any(p_months)
  group by n.reference_month;
$$;

revoke execute on function public.monthly_income_totals(date[]) from public, anon, service_role;
grant  execute on function public.monthly_income_totals(date[]) to authenticated;

-- ── Gasto por cartão na competência ────────────────────────────────────────
-- Só parcelas de cartão (as de conta ficam de fora, e aparecem no recorte por
-- categoria). O nome e a cor vêm juntos para a legenda não precisar de outra
-- consulta.
create or replace function public.spending_by_card(p_ref_month date)
returns table (card_id uuid, card_name text, card_color text, cents bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select c.id, c.name, c.color, sum(i.amount_cents)::bigint
  from installments i
  join cards c on c.id = i.card_id
  where i.reference_month = p_ref_month
    and i.deleted_at is null
  group by c.id, c.name, c.color;
$$;

revoke execute on function public.spending_by_card(date) from public, anon, service_role;
grant  execute on function public.spending_by_card(date) to authenticated;
