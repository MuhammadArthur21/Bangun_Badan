import { createPlanForDate } from "@/lib/engine/plan";
import { dateKeySchema } from "@/lib/engine/schema";
import type { ProgramProfile } from "@/lib/engine/types";
import { isPublicSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  const url = new URL(request.url);
  const parsedDate = dateKeySchema.safeParse(url.searchParams.get("date"));
  if (!parsedDate.success) {
    return Response.json(
      { error: "Parameter date wajib berformat YYYY-MM-DD dan valid." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return Response.json({ error: "Sesi autentikasi tidak dapat diverifikasi." }, { status: 401 });
  }
  if (!user) {
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

  const { data: frozenSessions, error: frozenError } = await supabase
    .from("planned_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("plan_date", parsedDate.data)
    .order("slot");
  if (frozenError) {
    return Response.json({ error: "Rencana sesi gagal dibaca." }, { status: 500 });
  }

  if (frozenSessions.length === profile.slots.length) {
    return Response.json({ date: parsedDate.data, sessions: frozenSessions });
  }

  const { data: catalog, error: catalogError } = await supabase
    .from("exercises")
    .select("*");
  if (catalogError) {
    return Response.json({ error: "Katalog latihan gagal dibaca." }, { status: 500 });
  }
  if (catalog.length === 0) {
    return Response.json(
      { error: "Katalog latihan belum tersedia di database." },
      { status: 503 },
    );
  }

  const domainProfile: ProgramProfile = {
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
  const generated = createPlanForDate(
    domainProfile,
    catalog,
    parsedDate.data,
  );
  const existingSlots = new Set(frozenSessions.map(({ slot }) => slot));
  const missingSessions = generated
    .filter(({ slot }) => !existingSlots.has(slot))
    .map((session) => ({
      user_id: user.id,
      plan_date: session.date,
      slot: session.slot,
      focus: session.focus,
      exercise_ids: session.exerciseIds,
    }));

  if (missingSessions.length > 0) {
    const { error: insertError } = await supabase
      .from("planned_sessions")
      .upsert(missingSessions, {
        onConflict: "user_id,plan_date,slot",
        ignoreDuplicates: true,
      });
    if (insertError) {
      return Response.json({ error: "Rencana sesi gagal disimpan." }, { status: 500 });
    }
  }

  const { data: sessions, error: readError } = await supabase
    .from("planned_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("plan_date", parsedDate.data)
    .order("slot");
  if (readError) {
    return Response.json({ error: "Rencana sesi gagal dibaca ulang." }, { status: 500 });
  }

  return Response.json({ date: parsedDate.data, sessions });
}
