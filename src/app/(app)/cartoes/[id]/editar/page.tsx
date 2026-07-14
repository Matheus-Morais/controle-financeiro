import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CardForm } from "@/components/card-form";
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
        <Link href={`/cartoes/${id}`} className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl font-bold">Editar cartão</h1>
      </div>

      <CardForm action={updateWithId} card={card} />

      <form action={deleteWithId}>
        <button
          type="submit"
          className="w-full rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 dark:border-red-900"
        >
          Excluir cartão
        </button>
      </form>
    </div>
  );
}
