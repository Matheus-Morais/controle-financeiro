import { ListSkeleton } from "@/components/skeleton";

// Fallback de Suspense para todas as telas da área logada.
// Skeleton genérico (título + linhas) — a maioria das telas é lista/dashboard.
// Renderiza dentro do layout (bottom-nav permanece visível).
export default function Loading() {
  return <ListSkeleton />;
}
