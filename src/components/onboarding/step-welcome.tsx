"use client";

import { CreditCard, PieChart, Wallet } from "lucide-react";

const HIGHLIGHTS = [
  { icon: Wallet, text: "Registre sua renda e acompanhe quanto sobra todo mês" },
  { icon: CreditCard, text: "Cadastre seus cartões e importe faturas em PDF automaticamente" },
  { icon: PieChart, text: "Organize categorias e defina metas de orçamento" },
];

export function StepWelcome({ displayName, onNext }: { displayName: string; onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-between">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/10">
          <Wallet size={40} className="text-brand" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Olá{displayName ? `, ${displayName}` : ""}!</h1>
          <p className="mt-2 text-neutral-500">
            Bora colocar sua vida financeira e seus cartões de crédito em ordem.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 text-left">
          {HIGHLIGHTS.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm shadow-sm dark:bg-neutral-900"
            >
              <Icon size={20} className="shrink-0 text-brand" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-brand py-3 font-semibold text-white active:scale-[0.98]"
      >
        Vamos começar
      </button>
    </div>
  );
}
