-- ============================================================================
-- Exclusão de conta:
--   - "excluir tudo": feito pela aplicação via auth.admin.deleteUser (service
--     role) — todas as tabelas já têm `on delete cascade` até auth.users, então
--     a remoção do usuário no Auth já limpa o resto do banco.
--   - "reiniciar conta" (soft reset): mantém o usuário e o profile, mas apaga
--     todos os registros/config e devolve o estado de usuário novo. Como o
--     trigger de provisionamento (0003) só dispara em INSERT em auth.users,
--     extraímos a semeadura de dados padrão para uma função reutilizável,
--     chamada tanto pelo trigger quanto pela função de reset.
-- ============================================================================

-- ── semeadura de dados padrão (extraída de handle_new_user) ────────────────
create or replace function public.provision_default_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (user_id, name, type, is_default, color)
  values (p_user_id, 'Carteira', 'wallet', true, '#64748b');

  insert into public.categories (user_id, name, icon, color) values
    (p_user_id, 'Mercado',            'shopping-cart', '#16a34a'),
    (p_user_id, 'Alimentação',        'utensils',      '#f97316'),
    (p_user_id, 'Transporte',         'car',           '#0ea5e9'),
    (p_user_id, 'Moradia',            'home',          '#8b5cf6'),
    (p_user_id, 'Saúde',              'heart-pulse',   '#ef4444'),
    (p_user_id, 'Lazer',              'gamepad-2',     '#ec4899'),
    (p_user_id, 'Assinaturas',        'repeat',        '#6366f1'),
    (p_user_id, 'Educação',           'graduation-cap','#14b8a6'),
    (p_user_id, 'Vestuário',          'shirt',         '#d946ef'),
    (p_user_id, 'Pets',               'paw-print',     '#d97706'),
    (p_user_id, 'Viagem',             'plane',         '#06b6d4'),
    (p_user_id, 'Presentes',          'gift',          '#f43f5e'),
    (p_user_id, 'Contas/Utilidades',  'receipt',       '#eab308'),
    (p_user_id, 'Compras online',     'shopping-bag',  '#9333ea'),
    (p_user_id, 'Cuidados pessoais',  'sparkles',      '#db2777'),
    (p_user_id, 'Investimentos',      'trending-up',   '#059669'),
    (p_user_id, 'Impostos e taxas',   'landmark',      '#57534e'),
    (p_user_id, 'Outros',             'ellipsis',      '#94a3b8');
end;
$$;

-- ── trigger de novo usuário agora delega a semeadura ────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  perform public.provision_default_account_data(new.id);

  return new;
end;
$$;

-- ── reset da conta (soft reset) ─────────────────────────────────────────────
-- security invoker: roda com o papel do usuário autenticado (auth.uid()), a
-- RLS de cada tabela já garante que só apaga/insere os próprios registros.
-- Executar como uma única função dá atomicidade (tudo numa transação) ao
-- apagar em várias tabelas — coisa que várias chamadas separadas via
-- supabase-js não garantiriam.
create or replace function public.reset_account_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  delete from public.notification_log   where user_id = v_user_id;
  delete from public.push_subscriptions where user_id = v_user_id;
  delete from public.budgets            where user_id = v_user_id;
  delete from public.incomes            where user_id = v_user_id;
  delete from public.installments       where user_id = v_user_id;
  delete from public.invoices           where user_id = v_user_id;
  delete from public.transactions       where user_id = v_user_id;
  delete from public.recurring_expenses where user_id = v_user_id;
  delete from public.cards              where user_id = v_user_id;
  delete from public.categories         where user_id = v_user_id;
  delete from public.accounts           where user_id = v_user_id;

  update public.profiles
  set timezone                 = 'America/Sao_Paulo',
      weekly_reminder_enabled  = true,
      weekly_reminder_day      = 1,
      monthly_reminder_enabled = true,
      updated_at               = now()
  where user_id = v_user_id;

  perform public.provision_default_account_data(v_user_id);
end;
$$;

grant execute on function public.reset_account_data() to authenticated;
