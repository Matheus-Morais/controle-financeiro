import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { todayISO } from "@/lib/date";
import { IncomeForm } from "@/components/income-form";
import { createIncome } from "../actions";

export default function NovoRecebimentoPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/recebimentos" className="text-neutral-500">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl font-bold">Novo recebimento</h1>
      </div>
      <IncomeForm action={createIncome} today={todayISO()} />
    </div>
  );
}
