-- ============================================================================
-- Expande as categorias padrão (Vestuário, Pets, Viagem, Presentes,
-- Contas/Utilidades, Compras online, Cuidados pessoais, Investimentos,
-- Impostos e taxas) para usuários que já existiam antes dessas categorias
-- serem adicionadas ao provisionamento de novo usuário (0003).
-- Idempotente: só insere a categoria que o usuário ainda não tem pelo nome.
-- ============================================================================

insert into public.categories (user_id, name, icon, color)
select p.user_id, v.name, v.icon, v.color
from public.profiles p
cross join (
  values
    ('Vestuário',         'shirt',        '#d946ef'),
    ('Pets',              'paw-print',    '#d97706'),
    ('Viagem',            'plane',        '#06b6d4'),
    ('Presentes',         'gift',         '#f43f5e'),
    ('Contas/Utilidades', 'receipt',      '#eab308'),
    ('Compras online',    'shopping-bag', '#9333ea'),
    ('Cuidados pessoais', 'sparkles',     '#db2777'),
    ('Investimentos',     'trending-up',  '#059669'),
    ('Impostos e taxas',  'landmark',     '#57534e')
) as v(name, icon, color)
where not exists (
  select 1 from public.categories c
  where c.user_id = p.user_id and c.name = v.name
);
