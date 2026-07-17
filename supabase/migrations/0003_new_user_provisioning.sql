-- ============================================================================
-- Provisionamento automático ao criar um usuário no Supabase Auth:
--   - cria o profile
--   - cria uma conta "Carteira" padrão (dinheiro/PIX/débito)
--   - semeia categorias iniciais
-- Roda com SECURITY DEFINER para inserir apesar da RLS.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.accounts (user_id, name, type, is_default, color)
  values (new.id, 'Carteira', 'wallet', true, '#64748b');

  insert into public.categories (user_id, name, icon, color) values
    (new.id, 'Mercado',            'shopping-cart', '#16a34a'),
    (new.id, 'Alimentação',        'utensils',      '#f97316'),
    (new.id, 'Transporte',         'car',           '#0ea5e9'),
    (new.id, 'Moradia',            'home',          '#8b5cf6'),
    (new.id, 'Saúde',              'heart-pulse',   '#ef4444'),
    (new.id, 'Lazer',              'gamepad-2',     '#ec4899'),
    (new.id, 'Assinaturas',        'repeat',        '#6366f1'),
    (new.id, 'Educação',           'graduation-cap','#14b8a6'),
    (new.id, 'Vestuário',          'shirt',         '#d946ef'),
    (new.id, 'Pets',               'paw-print',     '#d97706'),
    (new.id, 'Viagem',             'plane',         '#06b6d4'),
    (new.id, 'Presentes',          'gift',          '#f43f5e'),
    (new.id, 'Contas/Utilidades',  'receipt',       '#eab308'),
    (new.id, 'Compras online',     'shopping-bag',  '#9333ea'),
    (new.id, 'Cuidados pessoais',  'sparkles',      '#db2777'),
    (new.id, 'Investimentos',      'trending-up',   '#059669'),
    (new.id, 'Impostos e taxas',   'landmark',      '#57534e'),
    (new.id, 'Outros',             'ellipsis',      '#94a3b8');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
