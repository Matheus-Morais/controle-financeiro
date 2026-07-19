-- ============================================================================
-- Soft-delete de parcelas.
--
-- Excluir um gasto não apaga a linha: marca `deleted_at`. A parcela some do total
-- da fatura, mas continua visível na tela do cartão (esmaecida, no fim da lista),
-- preservando o histórico. Exclusão sempre "deste mês em diante" — competências
-- anteriores nunca são tocadas.
-- ============================================================================

alter table installments add column deleted_at timestamptz;

-- Consultas da fatura filtram por (card_id, reference_month) e agora também por
-- "não excluído"; o índice parcial acelera o caso comum (parcelas ativas).
create index installments_active_card_month_idx
  on installments (card_id, reference_month)
  where deleted_at is null;
