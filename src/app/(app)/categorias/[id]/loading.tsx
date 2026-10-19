import { ListSkeleton } from "@/components/skeleton";

// Cabeçalho, seletor de mês e lista de lançamentos da categoria.
export default function Loading() {
  return <ListSkeleton rows={6} />;
}
