-- ============================================================================
-- Recebimentos: modo de recorrência por "N-ésimo dia útil".
--   - recurring_mode: 'day_of_month' (comportamento atual, usa recurring_day)
--                     ou 'nth_business_day' (usa recurring_business_day).
--   - recurring_business_day: posição do dia útil (1–23), ex.: 5 = 5º dia útil.
-- O dia útil é recalculado a cada mês na materialização (src/lib/recurring.ts),
-- considerando fins de semana e feriados nacionais (src/lib/business-days.ts).
-- ============================================================================

alter table incomes
  add column recurring_mode text not null default 'day_of_month'
    check (recurring_mode in ('day_of_month', 'nth_business_day'));

alter table incomes
  add column recurring_business_day smallint
    check (recurring_business_day between 1 and 23);
