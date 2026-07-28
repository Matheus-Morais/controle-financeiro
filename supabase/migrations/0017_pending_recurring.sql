-- ============================================================================
-- 0017: leitura das assinaturas pendentes numa única ida ao banco (performance).
--
-- `materializeRecurringExpenses` roda no caminho de RENDER de quatro telas
-- (dashboard, lista de cartões, detalhe do cartão e contas) — e três delas o
-- chamam para DOIS meses. Cada chamada gastava quatro round-trips PostgREST em
-- série só para descobrir que não havia nada a fazer:
--
--   recurring_expenses → cards → transactions → installments
--
-- Com o app na Vercel (iad1/gru1) e o banco em sa-east-1, cada round-trip custa
-- dezenas de ms; oito deles antes do primeiro byte de HTML dominavam o TTFB.
--
-- Esta função devolve, para um conjunto de competências de uma vez, apenas as
-- assinaturas que AINDA NÃO foram materializadas — já com o ciclo do cartão
-- embutido. O caso comum (nada pendente) passa a custar UM round-trip.
--
-- O que ela deliberadamente NÃO faz é calcular datas: `purchase_date`,
-- fechamento e vencimento continuam saindo de `src/lib/invoice.ts`, que é puro e
-- testado. Duplicar a regra de competência em PL/pgSQL criaria uma segunda fonte
-- da verdade para RN-19/RN-23 — o ganho não paga esse risco. A escrita segue
-- pela `materialize_recurring_atomic` da 0016.
--
-- Idempotência idêntica à da versão em TypeScript (RN-24): uma assinatura conta
-- como lançada quando existe parcela dela na competência, INCLUSIVE com
-- soft-delete — o usuário excluiu a ocorrência do mês de propósito, e recriá-la
-- no próximo tick seria ressuscitar o que ele apagou.
-- ============================================================================

create or replace function public.pending_recurring_expenses(
  p_user_id    uuid,
  p_ref_months date[]
)
returns table (
  reference_month date,
  recurring_id    uuid,
  card_id         uuid,
  account_id      uuid,
  category_id     uuid,
  description     text,
  amount_cents    bigint,
  billing_day     smallint,
  closing_day     smallint,
  due_day         smallint
)
language plpgsql
security invoker
stable
set search_path = public
as $$
-- Todo nome do `returns table` acima (reference_month, card_id, description…)
-- também é nome de coluna das tabelas lidas aqui, e o plpgsql declara os campos
-- de retorno como VARIÁVEIS. A query abaixo qualifica tudo (`r.`, `i.`, `c.`,
-- `m.`), mas a diretiva garante que uma referência não qualificada acrescentada
-- depois resolva para a coluna em vez de virar erro de ambiguidade.
#variable_conflict use_column
declare
  v_caller uuid := auth.uid();
begin
  if p_user_id is null then
    raise exception 'p_user_id é obrigatório' using errcode = '22004';
  end if;
  -- Mesma regra da 0016: com sessão, só o próprio usuário. Sem sessão é o cron
  -- (service role), confiável por definição e fora da RLS.
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'usuário inválido' using errcode = '42501';
  end if;

  return query
  select
    m.ref,
    r.id,
    r.card_id,
    r.account_id,
    r.category_id,
    r.description,
    r.amount_cents,
    r.billing_day,
    -- Assinatura sem cartão (conta fixa) não tem ciclo: o chamador aplica o
    -- ACCOUNT_CLOSING_DAY de lib/invoice.ts sobre o null.
    c.closing_day,
    c.due_day
  from unnest(p_ref_months) as m(ref)
  join recurring_expenses r
    on  r.user_id     = p_user_id
    and r.active
    and r.start_month <= m.ref
    and (r.end_month is null or r.end_month >= m.ref)
  left join cards c on c.id = r.card_id
  where not exists (
    select 1
    from installments i
    join transactions t on t.id = i.transaction_id
    where t.recurring_id     = r.id
      and i.reference_month  = m.ref
  )
  order by m.ref, r.id;
end;
$$;

grant execute on function public.pending_recurring_expenses(uuid, date[])
  to authenticated, service_role;

-- O `not exists` acima navega installments → transactions pela competência. O
-- índice de (transaction_id, reference_month) fecha o caminho; o inverso
-- (transactions.recurring_id) já veio na 0015.
create index if not exists installments_transaction_month_idx
  on installments (transaction_id, reference_month);
