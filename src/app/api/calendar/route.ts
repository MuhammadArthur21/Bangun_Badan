import {
  calculateStreakFromSessions,
  getCalendarStatuses,
} from "@/lib/engine/calendar";
import { dateKeyInTimezone, monthDateKeys } from "@/lib/engine/dates";
import { monthKeySchema } from "@/lib/engine/schema";
import type { Exercise, ProgramProfile } from "@/lib/engine/types";
import { freezePlansInRange } from "@/lib/server/freeze-plans";
import { isPublicSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  const parsedMonth = monthKeySchema.safeParse(
    new URL(request.url).searchParams.get("month"),
  );
  if (!parsedMonth.success) {
    return Response.json(
      { error: "Parameter month wajib berformat YYYY-MM dan valid." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return Response.json({ error: "Profil latihan gagal dibaca." }, { status: 500 });
  }
  if (!profile) {
    return Response.json({ error: "Program latihan belum dibuat." }, { status: 404 });
  }

  const today = dateKeyInTimezone(new Date(), profile.timezone);
  const dates = monthDateKeys(parsedMonth.data);
  const monthEnd = dates[dates.length - 1];
  const historyEnd = monthEnd > today ? monthEnd : today;
  const { data: catalog, error: catalogError } = await supabase
    .from("exercises")
    .select("*");
  if (catalogError) {
    return Response.json({ error: "Katalog latihan gagal dibaca." }, { status: 500 });
  }

  const engineProfile: ProgramProfile = {
    gender: profile.gender,
    age: profile.age,
    mode: profile.mode,
    equipment: profile.equipment,
    targets: profile.targets,
    daysPerWeek: profile.days_per_week,
    slots: profile.slots,
    startDate: profile.start_date,
    timezone: profile.timezone,
  };
  const frozen = await freezePlansInRange(
    supabase,
    user.id,
    engineProfile,
    catalog as Exercise[],
    profile.start_date,
    historyEnd,
  );
  if (frozen.error) {
    return Response.json({ error: frozen.error }, { status: 500 });
  }

  const { data: logs, error: logsError } = await supabase
    .from("session_logs")
    .select("plan_date, slot, exercise_id, done_at")
    .eq("user_id", user.id)
    .gte("plan_date", profile.start_date)
    .lte("plan_date", historyEnd);
  if (logsError) {
    return Response.json({ error: "Riwayat latihan gagal dibaca." }, { status: 500 });
  }

  const domainLogs = logs.map((log) => ({
    date: log.plan_date,
    slot: log.slot,
    exerciseId: log.exercise_id,
    doneAt: log.done_at,
  }));
  const monthSessions = frozen.sessions.filter(
    ({ date }) => date >= dates[0] && date <= monthEnd,
  );
  const statuses = getCalendarStatuses(dates, monthSessions, domainLogs, today);
  const streak = calculateStreakFromSessions(
    profile.start_date,
    today,
    frozen.sessions,
    domainLogs,
  );

  return Response.json({
    month: parsedMonth.data,
    today,
    statuses,
    streak,
    icsUrl: `/api/ics/${profile.ics_token}.ics`,
  });
}
