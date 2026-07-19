import { CardDetailSkeleton } from "@/components/skeleton";

// Skeleton específico da tela de detalhe do cartão (cabeçalho, seletor de mês,
// resumo da fatura e lançamentos).
export default function Loading() {
  return <CardDetailSkeleton />;
}
