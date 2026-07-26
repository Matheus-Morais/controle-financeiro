import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { IncomeForm } from "@/components/income-form";
import { createIncome } from "../actions";

export default async function NovoRecebimentoPage() {
  const supabase = await createClient();
  // Data padrão no timezone DO USUÁRIO (RN-08): com o default do servidor, na
  // virada do dia o formulário abriria com a data errada.
  const today = todayISO(await sessionTimezone(supabase));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/recebimentos" className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl font-bold">Novo recebimento</h1>
      </div>
      <IncomeForm action={createIncome} today={today} />
    </div>
  );
}
