-- ============================================================================
-- 0015: índices das queries quentes (AJ-16).
--
-- Os índices existentes cobrem (card_id, reference_month) — o caminho da tela do
-- cartão. Faltava o caminho por (user_id, competência), que é o do dashboard, e
-- os das rotinas de recorrência e de importação.
-- ============================================================================

-- spendingByCategory / monthlyTotals: agregam as parcelas VIVAS do usuário no mês.
create index if not exists installments_user_month_active_idx
  on installments (user_id, reference_month)
  where deleted_at is null;

-- materializedRecurringIds / softDeleteInstallments: navegam pelas ocorrências
-- de uma assinatura. Parcial porque a esmagadora maioria das transações não é
-- recorrente.
create index if not exists transactions_recurring_idx
  on transactions (recurring_id)
  where recurring_id is not null;

-- getExistingInvoiceContext: apelidos (nome bruto da fatura) por assinatura.
create index if not exists transactions_recurring_statement_idx
  on transactions (recurring_id, statement_description)
  where recurring_id is not null and statement_description is not null;
