-- ============================================================================
-- Row Level Security — cada usuário só enxerga e altera os próprios dados.
-- Padrão: habilita RLS e cria uma policy "own rows" para todas as operações.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'accounts', 'cards', 'categories', 'recurring_expenses',
    'transactions', 'installments', 'invoices', 'incomes', 'budgets',
    'push_subscriptions', 'notification_log'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security;', t);

    -- profiles usa a coluna user_id como PK; as demais também têm user_id.
    execute format($f$
      create policy %1$I_select on %1$I for select using (user_id = auth.uid());
      create policy %1$I_insert on %1$I for insert with check (user_id = auth.uid());
      create policy %1$I_update on %1$I for update using (user_id = auth.uid()) with check (user_id = auth.uid());
      create policy %1$I_delete on %1$I for delete using (user_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- Nota: o cron server-side (envio de push) usa a SERVICE ROLE KEY, que ignora
-- RLS por padrão — portanto consegue ler subscriptions/prefs de todos os
-- usuários. Nunca exponha essa key no client.
