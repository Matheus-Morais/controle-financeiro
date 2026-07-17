"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { ManagedCategory } from "@/components/category-manager";
import { SkipAllButton } from "./skip-all-button";
import { StepWelcome } from "./step-welcome";
import { StepIncome } from "./step-income";
import { StepCards } from "./step-cards";
import { StepCategories } from "./step-categories";
import { StepBudget } from "./step-budget";
import { StepFinal } from "./step-final";

const TOTAL_STEPS = 6;

type CardSummary = { id: string; name: string; color: string | null };

export function OnboardingWizard({
  displayName,
  initialCategories,
  todayISODate,
}: {
  displayName: string;
  initialCategories: ManagedCategory[];
  todayISODate: string;
}) {
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<ManagedCategory[]>(initialCategories);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [incomeCents, setIncomeCents] = useState<number | null>(null);
  const [budgetedCount, setBudgetedCount] = useState(0);

  const isFirst = step === 0;
  const isLast = step === TOTAL_STEPS - 1;

  function next() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 pt-2">
      <div className="flex items-center justify-between pb-6">
        {!isFirst && !isLast ? (
          <button type="button" onClick={back} className="p-1 text-neutral-500" aria-label="Voltar">
            <ChevronLeft size={22} />
          </button>
        ) : (
          <span className="w-10" />
        )}

        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={
                i === step
                  ? "h-1.5 w-5 rounded-full bg-brand transition-all"
                  : i < step
                    ? "h-1.5 w-1.5 rounded-full bg-brand/40 transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-neutral-200 transition-all dark:bg-neutral-800"
              }
            />
          ))}
        </div>

        {!isFirst && !isLast ? <SkipAllButton /> : <span className="w-10" />}
      </div>

      <div className="flex flex-1 flex-col">
        {step === 0 && <StepWelcome displayName={displayName} onNext={next} />}

        {step === 1 && (
          <StepIncome
            today={todayISODate}
            onBack={back}
            onNext={(cents) => {
              setIncomeCents(cents);
              next();
            }}
          />
        )}

        {step === 2 && (
          <StepCards cards={cards} onCardsChange={setCards} onBack={back} onNext={next} />
        )}

        {step === 3 && (
          <StepCategories
            categories={categories}
            onCategoriesChange={setCategories}
            onBack={back}
            onNext={next}
          />
        )}

        {step === 4 && (
          <StepBudget
            categories={categories}
            onBack={back}
            onNext={(count) => {
              setBudgetedCount(count);
              next();
            }}
          />
        )}

        {step === 5 && (
          <StepFinal
            incomeCents={incomeCents}
            cardsCount={cards.length}
            categoriesCount={categories.length}
            budgetedCount={budgetedCount}
          />
        )}
      </div>
    </div>
  );
}
