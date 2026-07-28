import { BackLink } from "@/components/back-link";
import { CardForm } from "@/components/card-form";
import { createCard } from "../actions";

export default function NovoCartaoPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackLink href="/cartoes" label="Voltar para os cartões" />
        <h1 className="text-2xl font-bold">Novo cartão</h1>
      </div>
      <CardForm action={createCard} />
    </div>
  );
}
