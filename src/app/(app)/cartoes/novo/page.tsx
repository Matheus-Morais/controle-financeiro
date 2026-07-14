import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CardForm } from "@/components/card-form";
import { createCard } from "../actions";

export default function NovoCartaoPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/cartoes" className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl font-bold">Novo cartão</h1>
      </div>
      <CardForm action={createCard} />
    </div>
  );
}
