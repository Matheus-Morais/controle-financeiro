import { z } from "zod";

/** Dia do mês 1–31. */
const dayOfMonth = z.coerce.number().int().min(1).max(31);

export const cardSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(60),
  brand: z.string().trim().max(40).optional().or(z.literal("")),
  closing_day: dayOfMonth,
  due_day: dayOfMonth,
  color: z.string().trim().max(20).optional().or(z.literal("")),
  last_four: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "4 dígitos")
    .optional()
    .or(z.literal("")),
  credit_limit_cents: z.coerce.number().int().min(0).optional(),
});

export type CardInput = z.infer<typeof cardSchema>;

export const expenseKindSchema = z.enum(["single", "installment"]);

export const expenseSchema = z
  .object({
    description: z.string().trim().min(1, "Informe uma descrição").max(120),
    amount_cents: z.coerce.number().int().positive("Valor deve ser maior que zero"),
    /** Origem no formato "card:<id>" ou "account:<id>". */
    source: z.string().regex(/^(card|account):[0-9a-f-]{36}$/, "Selecione a origem"),
    kind: expenseKindSchema,
    installments_count: z.coerce.number().int().min(1).max(72).default(1),
    category_id: z.string().uuid().optional().or(z.literal("")),
    purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((v) => v.kind === "single" || v.installments_count >= 2, {
    message: "Parcelado exige 2 ou mais parcelas",
    path: ["installments_count"],
  });

export type ExpenseInput = z.infer<typeof expenseSchema>;

/** Extrai tipo e id de uma origem "card:<id>" / "account:<id>". */
export function parseSource(source: string): { kind: "card" | "account"; id: string } {
  const [kind, id] = source.split(":");
  return { kind: kind as "card" | "account", id };
}
