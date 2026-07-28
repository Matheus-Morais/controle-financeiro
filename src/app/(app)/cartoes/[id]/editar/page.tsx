import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";
import { CardForm } from "@/components/card-form";
import { DeleteCardButton } from "@/components/delete-card-button";
import { deleteCard, updateCard } from "../../actions";

export default async function EditarCartaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("*").eq("id", id).single();
  if (!card) notFound();

  const updateWithId = updateCard.bind(null, id);
  const deleteWithId = deleteCard.bind(null, id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackLink href={`/cartoes/${id}`} label="Voltar para o cartão" />
        <h1 className="text-2xl font-bold">Editar cartão</h1>
      </div>

      <CardForm action={updateWithId} card={card} />

      <DeleteCardButton onDelete={deleteWithId} />
    </div>
  );
}
