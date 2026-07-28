-- ============================================================================
-- 0018: agregação dos relatórios no banco (performance + correção).
--
-- Os relatórios puxavam LINHAS e somavam em JavaScript: `monthlyTotals` trazia
-- todas as parcelas de seis meses para devolver seis números, `spendingByCategory`
-- fazia duas idas (parcelas → transações) para agrupar por categoria, e o fluxo de
-- caixa do mês eram três idas em série.
--
-- Além do payload, isso era um BUG latente: o PostgREST limita a resposta a
-- `max-rows` (1000 no default do Supabase). Um usuário com histórico grande
-- recebia a soma de um PREFIXO das parcelas — total silenciosamente errado, sem
-- erro nenhum. Somando no Postgres o limite deixa de existir: o que trafega são
-- as linhas agregadas.
--
-- Nenhuma destas funções decide regra de negócio. `deriveInvoiceState` (paga /
-- a pagar / prevista) continua em `src/lib/invoice.ts`, puro e testado — aqui só
-- saem os campos crus (status, closing_date) para ele decidir.
--
-- ── Escopo e segurança ────────────────────────────────────────────────────
-- Todas são `security invoker` e SEM parâmetro de usuário: quem recorta é a RLS
-- do chamador.
--
-- O `revoke ... from public` abaixo NÃO restringe nada — está mantido só para o
-- histórico bater com o que foi aplicado. O Supabase concede EXECUTE
-- explicitamente a `anon`, `authenticated` e `service_role` via default
-- privileges, e revogar do pseudo-papel PUBLIC não mexe nessas concessões
-- nominais. A restrição de verdade está na migration 0019, que revoga dos
-- papéis — leia-a junto com esta.
-- ============================================================================

-- ── Gasto por categoria na competência ─────────────────────────────────────
create or replace function public.spending_by_category(p_ref_month date)
returns table (category_id uuid, cents bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select t.category_id, sum(i.amount_cents)::bigint
  from installments i
  join transactions t on t.id = i.transaction_id
  where i.reference_month = p_ref_month
    and i.deleted_at is null
  group by t.category_id;
$$;

revoke execute on function public.spending_by_category(date) from public;
grant  execute on function public.spending_by_category(date) to authenticated;

-- ── Total gasto por competência (gráfico dos últimos meses) ────────────────
-- Meses sem parcela simplesmente não voltam; quem chama preenche com zero.
create or replace function public.monthly_totals(p_months date[])
returns table (reference_month date, cents bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select i.reference_month, sum(i.amount_cents)::bigint
  from installments i
  where i.reference_month = any(p_months)
    and i.deleted_at is null
  group by i.reference_month;
$$;

revoke execute on function public.monthly_totals(date[]) from public;
grant  execute on function public.monthly_totals(date[]) to authenticated;

-- ── Fluxo de caixa do mês (regime de vencimento) ───────────────────────────
-- Eram três round-trips em série (recebimentos → faturas+parcelas+cartões →
-- gastos à vista). O total de CADA fatura usa a competência DELA, não o mês
-- consultado — o caso normal é a fatura fechar no mês anterior ao vencimento.
create or replace function public.month_cash_flow(p_month date)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  select jsonb_build_object(
    'income_cents', coalesce((
      select sum(n.amount_cents)::bigint
      from incomes n
      where n.reference_month = p_month
    ), 0),

    'cash_spending_cents', coalesce((
      select sum(i.amount_cents)::bigint
      from installments i
      where i.reference_month = p_month
        and i.card_id is null
        and i.deleted_at is null
    ), 0),

    'invoices', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.due_date)
      from (
        select
          v.id,
          v.card_id,
          c.name            as card_name,
          c.color           as card_color,
          v.reference_month,
          v.closing_date,
          v.due_date,
          v.status,
          coalesce((
            select sum(i.amount_cents)::bigint
            from installments i
            where i.card_id         = v.card_id
              and i.reference_month = v.reference_month
              and i.deleted_at is null
          ), 0) as total_cents
        from invoices v
        left join cards c on c.id = v.card_id
        where v.due_date >= p_month
          and v.due_date <  (p_month + interval '1 month')::date
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.month_cash_flow(date) from public;
grant  execute on function public.month_cash_flow(date) to authenticated;

-- ── Limite comprometido de um cartão ───────────────────────────────────────
-- Soma das parcelas vivas nas competências cujas faturas ainda estão EM ABERTO
-- (as pagas já liberaram limite). Eram duas idas: faturas abertas → parcelas.
create or replace function public.card_committed_cents(p_card_id uuid)
returns bigint
language sql
security invoker
stable
set search_path = public
as $$
  select coalesce(sum(i.amount_cents), 0)::bigint
  from installments i
  where i.card_id = p_card_id
    and i.deleted_at is null
    and exists (
      select 1
      from invoices v
      where v.card_id         = i.card_id
        and v.reference_month = i.reference_month
        and v.status          = 'open'
    );
$$;

revoke execute on function public.card_committed_cents(uuid) from public;
grant  execute on function public.card_committed_cents(uuid) to authenticated;

-- ── Itens da fatura de um cartão numa competência ──────────────────────────
-- Sem filtro de `deleted_at` DE PROPÓSITO: as parcelas excluídas continuam
-- visíveis na tela, esmaecidas e no fim da lista (só não entram no total).
create or replace function public.invoice_items(p_card_id uuid, p_ref_month date)
returns table (
  id                 uuid,
  number             smallint,
  amount_cents       bigint,
  transaction_id     uuid,
  deleted_at         timestamptz,
  description        text,
  kind               expense_kind,
  installments_count smallint,
  purchase_date      date
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    i.id, i.number, i.amount_cents, i.transaction_id, i.deleted_at,
    t.description, t.kind, t.installments_count, t.purchase_date
  from installments i
  join transactions t on t.id = i.transaction_id
  where i.card_id         = p_card_id
    and i.reference_month = p_ref_month;
$$;

revoke execute on function public.invoice_items(uuid, date) from public;
grant  execute on function public.invoice_items(uuid, date) to authenticated;

-- ── Contas fora do cartão de uma competência ───────────────────────────────
-- Parcelas de origem CONTA (account_id preenchido, sem cartão), com a descrição
-- da transação e o nome/cor da conta. A ordenação por vencimento fica em JS, que
-- já trata o `due_date` nulo (vai para o fim).
create or replace function public.account_bills(p_ref_month date)
returns table (
  id            uuid,
  amount_cents  bigint,
  due_date      date,
  status        installment_status,
  description   text,
  kind          expense_kind,
  account_name  text,
  account_color text
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    i.id, i.amount_cents, i.due_date, i.status,
    t.description, t.kind,
    a.name, a.color
  from installments i
  join transactions t on t.id = i.transaction_id
  left join accounts a on a.id = i.account_id
  where i.reference_month = p_ref_month
    and i.account_id is not null
    and i.deleted_at is null;
$$;

revoke execute on function public.account_bills(date) from public;
grant  execute on function public.account_bills(date) to authenticated;
