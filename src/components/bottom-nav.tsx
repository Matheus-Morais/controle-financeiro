"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Home, Plus, Settings, Wallet } from "lucide-react";

const items = [
  { href: "/", label: "Início", icon: Home },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/gastos/novo", label: "Adicionar", icon: Plus, primary: true },
  { href: "/recebimentos", label: "Renda", icon: Wallet },
  { href: "/config", label: "Ajustes", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 pb-safe-bottom backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={
                  primary
                    ? "flex flex-col items-center gap-1 py-2"
                    : "flex flex-col items-center gap-1 py-2 text-xs"
                }
              >
                {primary ? (
                  <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg">
                    <Icon size={26} />
                  </span>
                ) : (
                  <>
                    <Icon size={22} className={active ? "text-brand" : "text-neutral-400"} />
                    <span className={active ? "text-brand" : "text-neutral-400"}>{label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
