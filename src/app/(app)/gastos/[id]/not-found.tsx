import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * 404 do segmento de gasto, em pt-BR e com saída.
 *
 * O caso comum não é URL digitada errada: é gasto que deixou de existir (troca
 * de cartão de uma assinatura apaga ocorrências órfãs, e a exclusão definitiva
 * apaga tudo) enquanto a fatura ainda estava em cache na tela anterior.
 */
export default function GastoNaoEncontrado() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <SearchX size={32} className="text-neutral-300" />
      <h1 className="text-lg font-semibold">Gasto não encontrado</h1>
      <p className="max-w-xs text-sm text-neutral-500">
        Ele pode ter sido excluído. Volte para a fatura para ver os lançamentos atuais.
      </p>
      <div className="mt-2 flex gap-2">
        <Link
          href="/cartoes"
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Ver cartões
        </Link>
        <Link
          href="/"
          className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
        >
          Início
        </Link>
      </div>
    </div>
  );
}
