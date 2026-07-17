import { PageLoader } from "@/components/loader";

// Fallback de Suspense para as telas de autenticação (tela cheia).
export default function Loading() {
  return <PageLoader className="min-h-screen" />;
}
