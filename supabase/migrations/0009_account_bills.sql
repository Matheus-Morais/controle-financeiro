-- ============================================================================
-- 0009: contas fora do cartão (formas de pagamento + vencimento das parcelas)
--
--  - Novas formas de pagamento no enum account_type: 'pix' e 'other'
--    (o usuário passa a cadastrar contas como "PIX", "Conta corrente", etc.).
--  - installments.due_date: vencimento da conta. Preenchido só em parcelas de
--    origem CONTA (account_id); em cartões fica null — cartões usam invoices.
--  - notification_type 'bills': dedupe dos lembretes de vencimento de conta.
-- ============================================================================

-- Enum de tipos de conta: PIX e "outro" como formas de pagamento fora do cartão.
alter type account_type add value if not exists 'pix';
alter type account_type add value if not exists 'other';

-- Tipo de notificação para os lembretes de contas a vencer.
alter type notification_type add value if not exists 'bills';

-- Vencimento da conta (só em parcelas de origem conta; null em cartões).
alter table public.installments
  add column if not exists due_date date;

comment on column public.installments.due_date is
  'Vencimento da conta (só em parcelas de origem conta; null em cartões, que usam invoices).';

-- Índice para os lembretes do cron: contas em aberto por vencimento.
create index if not exists installments_due_date_idx
  on public.installments (user_id, due_date)
  where account_id is not null and status = 'open' and deleted_at is null;
