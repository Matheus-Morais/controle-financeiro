-- ============================================================================
-- 0012: quota de importação de fatura (AJ-05).
--
-- /api/faturas/importar é o único endpoint com custo marginal por request (uma
-- chamada à Claude API com PDF de até 4 MB e 16k tokens de saída). Sem limite,
-- uma sessão autenticada em loop gera custo ilimitado.
--
-- O contador vive no banco (e não em memória) porque a função é serverless: não
-- há processo compartilhado entre invocações. Há policy de select e de insert,
-- mas NENHUMA de update/delete — o usuário não consegue zerar a própria quota.
-- ============================================================================

create table invoice_import_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index invoice_import_user_time_idx on invoice_import_log (user_id, created_at desc);

alter table invoice_import_log enable row level security;

create policy iil_select on invoice_import_log for select using (user_id = auth.uid());
create policy iil_insert on invoice_import_log for insert with check (user_id = auth.uid());
