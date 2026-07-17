"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCents } from "@/lib/money";
import { formatDayMonth } from "@/lib/date";
import { ConvertToRecurringButton } from "@/components/convert-to-recurring-button";

export interface InvoiceItem {
  id: string;
  transactionId: string;
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
  currentMonth,
}: {
  groups: Record<TabKey, InvoiceItem[]>;
  currentMonth: string; // YYYY-MM-01
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
              <li key={item.id} className="flex min-w-0 items-center gap-1">
                <Link
                  href={`/gastos/${item.transactionId}/editar`}
                  className="flex min-w-0 flex-1 items-center justify-between rounded-xl bg-white p-3 shadow-sm active:scale-[0.99] dark:bg-neutral-900"
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
                  <div className="ml-3 flex shrink-0 items-center gap-1">
                    <span className="font-semibold">{formatCents(item.amountCents)}</span>
                    <ChevronRight size={16} className="text-neutral-400" />
                  </div>
                </Link>
                {active === "single" && (
                  <ConvertToRecurringButton
                    transactionId={item.transactionId}
                    description={item.description}
                    amountCents={item.amountCents}
                    purchaseDate={item.purchaseDate}
                    currentMonth={currentMonth}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
