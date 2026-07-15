import { PageLoader } from "@/components/loader";

// Fallback de Suspense para todas as telas da área logada.
// Renderiza dentro do layout (bottom-nav permanece visível).
export default function Loading() {
  return <PageLoader />;
}
