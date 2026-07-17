import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CategoryManager } from "@/components/category-manager";
import { createCategory, deleteCategory, updateCategory } from "@/app/(app)/orcamento/actions";

export default async function CategoriasPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, color")
    .order("name");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/config" className="p-1 text-neutral-500">
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-2xl font-bold">Categorias</h1>
      </div>
      <p className="-mt-2 text-sm text-neutral-500">
        Personalize as categorias usadas nos seus gastos: renomeie, troque a cor (toque na
        bolinha), remova ou adicione novas.
      </p>

      <CategoryManager
        categories={categories ?? []}
        createAction={createCategory}
        updateAction={updateCategory}
        deleteAction={deleteCategory}
      />
    </div>
  );
}
