import { connection } from "next/server";
import { unpaidPenaltiesForPlans } from "@/lib/engine/penalty";
import { sessionKey } from "@/lib/engine/types";
import { addDays, dateKeyInTimezone } from "@/lib/engine/dates";
import type { Exercise, ProgramProfile } from "@/lib/engine/types";
import { freezePlansInRange } from "@/lib/server/freeze-plans";
import { isPublicSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  await connection();
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
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
  const yesterday = addDays(today, -1);
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
    yesterday,
  );
  if (frozen.error) {
    return Response.json({ error: frozen.error }, { status: 500 });
  }

  const [paymentsResult, logsResult] = await Promise.all([
    supabase
      .from("penalty_payments")
      .select("plan_date, slot")
      .eq("user_id", user.id)
      .gte("plan_date", profile.start_date)
      .lt("plan_date", today),
    supabase
      .from("session_logs")
      .select("plan_date, slot, exercise_id, done_at")
      .eq("user_id", user.id)
      .gte("plan_date", profile.start_date)
      .lt("plan_date", today)
      .not("done_at", "is", null),
  ]);
  if (paymentsResult.error || logsResult.error) {
    return Response.json({ error: "Riwayat denda gagal dibaca." }, { status: 500 });
  }

  const plans = frozen.sessions.filter(({ date }) => date < today);
  const paidSessions = new Set(
    paymentsResult.data.map(({ plan_date, slot }) => sessionKey(plan_date, slot)),
  );
  const doneExerciseIds = new Map<string, Set<string>>();
  for (const log of logsResult.data) {
    const key = sessionKey(log.plan_date, log.slot);
    const exerciseIds = doneExerciseIds.get(key) ?? new Set<string>();
    exerciseIds.add(log.exercise_id);
    doneExerciseIds.set(key, exerciseIds);
  }
  const completedSessions = new Set(
    plans
      .filter(
        ({ date, slot, exerciseIds }) =>
          exerciseIds.length > 0 &&
          exerciseIds.every((exerciseId) =>
            doneExerciseIds.get(sessionKey(date, slot))?.has(exerciseId),
          ),
      )
      .map(({ date, slot }) => sessionKey(date, slot)),
  );
  const penalties = unpaidPenaltiesForPlans(
    plans,
    profile.start_date,
    today,
    completedSessions,
    paidSessions,
  );

  return Response.json({ penalties });
}
