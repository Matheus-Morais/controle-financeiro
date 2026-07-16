-- ── statement_description ────────────────────────────────────────────────────
-- Nome do lançamento exatamente como aparece na fatura do cartão (ex.:
-- "EST XPTO*1234 SP"). Preenchido apenas por gastos importados de fatura via PDF;
-- fica NULL para gastos criados manualmente.
--
-- Serve a dois propósitos:
--   1) Deduplicação: reimportar a mesma fatura não deve recriar os gastos. A chave
--      é (card_id, reference_month da parcela, statement_description, valor, data).
--   2) Fallback de exibição: quando o usuário não dá um nome próprio ao gasto na
--      revisão, mantemos o texto original da fatura.
--
-- Não altera RLS: a política de `transactions` já é por user_id; adicionar coluna
-- nullable não afeta as policies existentes.

alter table transactions
  add column statement_description text;
