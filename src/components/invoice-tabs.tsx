"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { formatDayMonth } from "@/lib/date";

export interface InvoiceItem {
  id: string;
  description: string;
  amountCents: number;
  number: number;
  installmentsCount: number;
  purchaseDate: string;
}

type TabKey = "installment" | "recurring" | "single";

const TABS: { key: TabKey; label: string }[] = [
  { key: "installment", label: "Parcelado" },
  { key: "recurring", label: "Recorrente" },
  { key: "single", label: "À vista" },
];

export function InvoiceTabs({
  groups,
}: {
  groups: Record<TabKey, InvoiceItem[]>;
}) {
  const [active, setActive] = useState<TabKey>("installment");
  const items = groups[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex rounded-xl bg-neutral-200/70 p-1 dark:bg-neutral-800">
        {TABS.map((t) => {
          const total = groups[t.key].reduce((s, i) => s + i.amountCents, 0);
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={
                active === t.key
                  ? "flex-1 rounded-lg bg-white py-2 text-xs font-semibold shadow-sm dark:bg-neutral-950"
                  : "flex-1 rounded-lg py-2 text-xs font-medium text-neutral-500"
              }
            >
              {t.label}
              <span className="block text-[10px] font-normal opacity-70">
                {formatCents(total)}
              </span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          Nenhum gasto {TABS.find((t) => t.key === active)?.label.toLowerCase()} neste mês.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const remaining = item.installmentsCount - item.number;
            return (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-900"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.description}</p>
                  <p className="text-xs text-neutral-500">
                    {item.installmentsCount > 1 && (
                      <>
                        Parcela {item.number}/{item.installmentsCount}
                        {remaining > 0 && ` · faltam ${remaining}`}
                        {" · "}
                      </>
                    )}
                    compra em {formatDayMonth(item.purchaseDate)}
                  </p>
                </div>
                <p className="ml-3 shrink-0 font-semibold">{formatCents(item.amountCents)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
