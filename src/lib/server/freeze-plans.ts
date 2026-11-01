import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/engine/dates";
import { createPlanForDate } from "@/lib/engine/plan";
import type {
  Exercise,
  PlannedSession,
  ProgramProfile,
} from "@/lib/engine/types";
import type { Database } from "@/lib/supabase/database.types";

type PlannedSessionRow = Database["public"]["Tables"]["planned_sessions"]["Row"];

export async function freezePlansInRange(
  supabase: SupabaseClient<Database>,
  userId: string,
  profile: ProgramProfile,
  exercises: Exercise[],
  startDate: string,
  endDate: string,
): Promise<{ sessions: PlannedSession[]; error: string | null }> {
  if (startDate > endDate) return { sessions: [], error: null };
  if (exercises.length === 0) {
    return { sessions: [], error: "Katalog latihan belum tersedia di database." };
  }

  const { data: existingSessions, error: existingError } = await supabase
    .from("planned_sessions")
    .select("plan_date, slot, focus, exercise_ids")
    .eq("user_id", userId)
    .gte("plan_date", startDate)
    .lte("plan_date", endDate);
  if (existingError) {
    return { sessions: [], error: "Rencana sesi gagal dibaca." };
  }

  const existingKeys = new Set(
    existingSessions.map(({ plan_date, slot }) => `${plan_date}:${slot}`),
  );
  const generated: PlannedSession[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    generated.push(...createPlanForDate(profile, exercises, date));
  }
  const missingSessions = generated
    .filter(({ date, slot }) => !existingKeys.has(`${date}:${slot}`))
    .map((session) => ({
      user_id: userId,
      plan_date: session.date,
      slot: session.slot,
      focus: session.focus,
      exercise_ids: session.exerciseIds,
    }));

  for (let index = 0; index < missingSessions.length; index += 250) {
    const { error: insertError } = await supabase
      .from("planned_sessions")
      .upsert(missingSessions.slice(index, index + 250), {
        onConflict: "user_id,plan_date,slot",
        ignoreDuplicates: true,
      });
    if (insertError) {
      return { sessions: [], error: "Rencana sesi gagal dibekukan." };
    }
  }

  const { data: rows, error: readError } = await supabase
    .from("planned_sessions")
    .select("plan_date, slot, focus, exercise_ids")
    .eq("user_id", userId)
    .gte("plan_date", startDate)
    .lte("plan_date", endDate)
    .order("plan_date")
    .order("slot");
  if (readError) {
    return { sessions: [], error: "Rencana sesi gagal dibaca ulang." };
  }

  return {
    sessions: (rows as Pick<
      PlannedSessionRow,
      "plan_date" | "slot" | "focus" | "exercise_ids"
    >[]).map((session) => ({
      date: session.plan_date,
      slot: session.slot,
      focus: session.focus,
      exerciseIds: session.exercise_ids,
    })),
    error: null,
  };
}
