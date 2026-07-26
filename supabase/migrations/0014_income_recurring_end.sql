-- ============================================================================
-- 0014: encerramento de renda recorrente (AJ-13).
--
-- Não havia como parar uma renda recorrente: a única saída era apagar o
-- recebimento do mês — pouco descobrível e frágil (o mês seguinte voltava a
-- copiar do anterior). `recurring_end_month` é a última competência em que a
-- renda ainda se repete; a partir daí a materialização para.
--
-- Espelha `recurring_expenses.end_month`, que já existe do lado das despesas.
-- ============================================================================

alter table incomes
  add column if not exists recurring_end_month date;

comment on column public.incomes.recurring_end_month is
  'Última competência (YYYY-MM-01) em que a renda recorrente se repete; null = sem fim.';

-- A materialização busca as rendas recorrentes da competência anterior.
create index if not exists incomes_recurring_month_idx
  on incomes (user_id, reference_month)
  where is_recurring;
