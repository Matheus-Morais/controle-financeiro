-- ============================================================================
-- 0013: unicidade de orçamento por categoria/competência (AJ-12).
--
-- saveBudget fazia read-then-write sem constraint: dois cliques simultâneos
-- criavam duas linhas para a mesma categoria, e o `maybeSingle()` seguinte
-- passava a quebrar (mais de uma linha).
--
-- `nulls not distinct` (Postgres 15+) é essencial aqui: category_id null é o
-- orçamento GERAL e reference_month null é o orçamento RECORRENTE (vale todo
-- mês). Com a semântica padrão (nulls distintos) esses dois casos escapariam
-- da unicidade — justamente os que mais duplicam.
-- ============================================================================

-- Remove duplicatas preexistentes, mantendo a mais recente de cada chave.
delete from budgets b
using budgets other
where b.user_id = other.user_id
  and b.category_id is not distinct from other.category_id
  and b.reference_month is not distinct from other.reference_month
  and (b.created_at, b.id) < (other.created_at, other.id);

create unique index budgets_user_category_month_uk
  on budgets (user_id, category_id, reference_month)
  nulls not distinct;
