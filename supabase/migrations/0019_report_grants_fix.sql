-- ============================================================================
-- 0019: corrige as concessões das funções de relatório (a 0018 não fechou nada).
--
-- A 0018 tentou restringir as agregações a `authenticated` com
-- `revoke execute ... from public`. Isso NÃO funcionou, e a verificação pela
-- anon key expôs o erro: as seis funções responderam 200 em vez de 403.
--
-- Motivo: o Supabase configura default privileges no schema `public` que
-- concedem EXECUTE **explicitamente** a `anon`, `authenticated` e `service_role`
-- em toda função nova. Revogar de `public` remove apenas a concessão do
-- pseudo-papel PUBLIC — as concessões nominais continuam de pé. Para restringir
-- de fato é preciso revogar dos PAPÉIS, que é o que esta migration faz.
--
-- Não houve exposição de dado: a RLS sempre foi a barreira real e continuou
-- intacta (o `anon` executava e recebia conjunto vazio). O que faltava era a
-- defesa em profundidade — e, principalmente, barrar o `service_role`, que
-- IGNORA RLS e portanto era o único caminho pelo qual um relatório poderia ler
-- dados de outro usuário. É o que o CLAUDE.md proíbe por convenção ("relatórios
-- sempre com o client do usuário"); aqui vira impedimento.
--
-- ATENÇÃO para migrations futuras: por causa dos default privileges acima, toda
-- função nova nasce executável por anon e service_role. `revoke ... from public`
-- não basta — revogue dos papéis nominais, como abaixo.
-- ============================================================================

-- ── Agregações de relatório: só a sessão do usuário ────────────────────────
-- `service_role` sai porque ignora RLS; `anon` sai por menor privilégio (a RLS
-- já o deixava sem linhas, mas ele não tem o que fazer aqui).

revoke execute on function public.spending_by_category(date)     from public, anon, service_role;
grant  execute on function public.spending_by_category(date)     to authenticated;

revoke execute on function public.monthly_totals(date[])         from public, anon, service_role;
grant  execute on function public.monthly_totals(date[])         to authenticated;

revoke execute on function public.month_cash_flow(date)          from public, anon, service_role;
grant  execute on function public.month_cash_flow(date)          to authenticated;

revoke execute on function public.card_committed_cents(uuid)     from public, anon, service_role;
grant  execute on function public.card_committed_cents(uuid)     to authenticated;

revoke execute on function public.invoice_items(uuid, date)      from public, anon, service_role;
grant  execute on function public.invoice_items(uuid, date)      to authenticated;

revoke execute on function public.account_bills(date)            from public, anon, service_role;
grant  execute on function public.account_bills(date)            to authenticated;

-- ── Materialização: service_role PRECISA ficar ─────────────────────────────
-- O cron (`/api/cron/notifications`) roda sem sessão, com o service client, e
-- chama `pending_recurring_expenses` + `materialize_recurring_atomic`. Revogar
-- service_role daqui quebraria o tick diário. Só `anon` sai.

revoke execute on function public.pending_recurring_expenses(uuid, date[]) from public, anon;
grant  execute on function public.pending_recurring_expenses(uuid, date[]) to authenticated, service_role;

revoke execute on function public.materialize_recurring_atomic(uuid, jsonb, jsonb, jsonb) from public, anon;
grant  execute on function public.materialize_recurring_atomic(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
