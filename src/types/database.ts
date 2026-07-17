/**
 * Tipos do banco (Supabase). Mantidos à mão por ora; quando o schema
 * estabilizar, gere automaticamente com:
 *   supabase gen types typescript --local > src/types/database.ts
 *
 * IMPORTANTE: os tipos de linha são `type` (não `interface`). O postgrest-js
 * exige que cada `Row` seja atribuível a `Record<string, unknown>`, o que só
 * vale para type aliases de objeto (interfaces não têm index signature
 * implícita e fazem a inferência colapsar para `never`).
 */

export type AccountType = "wallet" | "checking" | "cash";
export type ExpenseKind = "single" | "installment" | "recurring";
export type InstallmentStatus = "open" | "paid";
export type InvoiceStatus = "open" | "paid";
export type NotificationType = "monthly" | "weekly";

type Timestamps = { created_at: string };

export type Profile = {
  user_id: string;
  display_name: string | null;
  timezone: string;
  currency: string;
  weekly_reminder_enabled: boolean;
  weekly_reminder_day: number;
  monthly_reminder_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type Account = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  color: string | null;
  is_default: boolean;
};

export type Card = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  closing_day: number;
  due_day: number;
  credit_limit_cents: number | null;
  color: string | null;
  last_four: string | null;
  active: boolean;
  updated_at: string;
};

export type Category = Timestamps & {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export type RecurringExpense = Timestamps & {
  id: string;
  user_id: string;
  card_id: string | null;
  account_id: string | null;
  category_id: string | null;
  description: string;
  amount_cents: number;
  billing_day: number;
  start_month: string;
  end_month: string | null;
  active: boolean;
};

export type Transaction = Timestamps & {
  id: string;
  user_id: string;
  card_id: string | null;
  account_id: string | null;
  category_id: string | null;
  recurring_id: string | null;
  description: string;
  kind: ExpenseKind;
  total_amount_cents: number;
  purchase_date: string;
  installments_count: number;
  notes: string | null;
  /** Nome bruto como aparece na fatura (só em gastos importados; null se manual). */
  statement_description: string | null;
};

export type Installment = Timestamps & {
  id: string;
  user_id: string;
  transaction_id: string;
  card_id: string | null;
  account_id: string | null;
  number: number;
  amount_cents: number;
  reference_month: string;
  status: InstallmentStatus;
};

export type Invoice = Timestamps & {
  id: string;
  user_id: string;
  card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  status: InvoiceStatus;
  paid_at: string | null;
};

export type Income = Timestamps & {
  id: string;
  user_id: string;
  description: string;
  amount_cents: number;
  receipt_date: string;
  reference_month: string;
  is_recurring: boolean;
  recurring_day: number | null;
  recurring_mode: "day_of_month" | "nth_business_day";
  recurring_business_day: number | null;
};

export type Budget = Timestamps & {
  id: string;
  user_id: string;
  category_id: string | null;
  reference_month: string | null;
  limit_cents: number;
};

export type PushSubscriptionRow = Timestamps & {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
};

export type NotificationLog = {
  id: string;
  user_id: string;
  type: NotificationType;
  sent_for: string;
  sent_at: string;
};

/**
 * Helper para descrever uma tabela no formato esperado pelo supabase-js
 * (precisa da chave `Relationships`, senão a inferência de tipos vira `never`).
 */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      accounts: Table<Account>;
      cards: Table<Card>;
      categories: Table<Category>;
      recurring_expenses: Table<RecurringExpense>;
      transactions: Table<Transaction>;
      installments: Table<Installment>;
      invoices: Table<Invoice>;
      incomes: Table<Income>;
      budgets: Table<Budget>;
      push_subscriptions: Table<PushSubscriptionRow>;
      notification_log: Table<NotificationLog>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      account_type: AccountType;
      expense_kind: ExpenseKind;
      installment_status: InstallmentStatus;
      invoice_status: InvoiceStatus;
      notification_type: NotificationType;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
