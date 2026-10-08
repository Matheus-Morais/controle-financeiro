import { createClient } from "@/lib/supabase/server";
import { currentReferenceMonth, formatMonthLabel } from "@/lib/date";
import { sessionTimezone } from "@/lib/user-time";
import { MonthNav } from "@/components/month-nav";
import { AssistantView } from "@/components/assistant/assistant-view";

export default async function AssistentePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const supabase = await createClient();
  const tz = await sessionTimezone(supabase);
  const { mes } = await searchParams;

  const month = mes ?? currentReferenceMonth(tz);
  const monthLabel = formatMonthLabel(month);

  return (
    <div className="flex flex-col gap-4">
      <MonthNav basePath="/assistente" refMonth={month} />
      <AssistantView refMonth={month} monthLabel={monthLabel} />
    </div>
  );
}
