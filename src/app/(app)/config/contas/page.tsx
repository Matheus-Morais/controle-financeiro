import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AccountManager } from "@/components/account-manager";
import { createAccount, updateAccount, deleteAccount } from "./actions";

export default async function ContasConfigPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type, color, is_default")
    .order("created_at");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/config" className="p-1 text-neutral-500">
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-2xl font-bold">Formas de pagamento</h1>
      </div>
      <p className="-mt-2 text-sm text-neutral-500">
        Cadastre suas formas de pagamento fora do cartão — PIX, conta corrente, dinheiro, boleto —
        para lançar gastos e contas fixas (luz, energia, internet, licenciamento) e acompanhá-las
        na aba Contas.
      </p>

      <AccountManager
        accounts={accounts ?? []}
        createAction={createAccount}
        updateAction={updateAccount}
        deleteAction={deleteAccount}
      />
    </div>
  );
}
