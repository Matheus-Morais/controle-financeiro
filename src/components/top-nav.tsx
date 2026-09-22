"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Home, Plus, Settings, Wallet, WalletCards } from "lucide-react";
import { newExpenseHref } from "@/lib/navigation";

const items = [
  { href: "/", label: "Início", icon: Home },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/gastos", label: "Gastos", icon: WalletCards },
  { href: "/recebimentos", label: "Renda", icon: Wallet },
  { href: "/config", label: "Ajustes", icon: Settings },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-neutral-200/80 bg-neutral-50/95 backdrop-blur md:block dark:border-neutral-800/80 dark:bg-neutral-950/95">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-6 lg:px-8" aria-label="Principal">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-brand" aria-label="Controle Financeiro">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
            CF
          </span>
          <span className="hidden lg:inline">Controle Financeiro</span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors lg:px-3 ${
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                }`}
              >
                <Icon size={17} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        <Link
          href={newExpenseHref(pathname)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white transition active:scale-95"
        >
          <Plus size={17} />
          <span className="hidden lg:inline">Adicionar gasto</span>
          <span className="lg:hidden">Adicionar</span>
        </Link>
      </nav>
    </header>
  );
}
