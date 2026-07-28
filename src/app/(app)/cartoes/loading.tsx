import { CardListSkeleton } from "@/components/skeleton";

// Skeleton da lista de cartões. A rota é pesada — materializa os recorrentes do
// mês corrente e do próximo (duas RPCs de escrita) antes do primeiro byte —, e
// sem uma boundary neste segmento o prefetch do <Link> não tinha o que cachear:
// voltar do detalhe do cartão ficava parado na tela antiga até o servidor
// responder, dando a sensação de tela travada.
export default function Loading() {
  return <CardListSkeleton />;
}
