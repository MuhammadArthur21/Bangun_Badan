import { z } from "zod";
import { dateKeyInTimezone } from "@/lib/engine/dates";
import { dateKeySchema } from "@/lib/engine/schema";
import { isPublicSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const logSchema = z.object({
  date: dateKeySchema,
  slot: z.number().int().min(0).max(2),
  exerciseId: z.string().min(1),
  setsDone: z.number().int().min(0),
});

const logQuerySchema = z.object({
  date: dateKeySchema,
  slot: z.coerce.number().int().min(0).max(2),
});

export async function GET(request: Request) {
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  const searchParams = new URL(request.url).searchParams;
  const parsed = logQuerySchema.safeParse({
    date: searchParams.get("date"),
    slot: searchParams.get("slot"),
  });
  if (!parsed.success) {
    return Response.json(
      { error: "Parameter date dan slot tidak valid." },
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

  const { data: logs, error } = await supabase
    .from("session_logs")
    .select("exercise_id, sets_done, done_at")
    .eq("user_id", user.id)
    .eq("plan_date", parsed.data.date)
    .eq("slot", parsed.data.slot);
  if (error) {
    return Response.json({ error: "Progres latihan gagal dibaca." }, { status: 500 });
  }
  return Response.json({ date: parsed.data.date, slot: parsed.data.slot, logs });
}

export async function POST(request: Request) {
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }
  const parsed = logSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Data log tidak valid." }, { status: 400 });
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
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return Response.json({ error: "Profil latihan gagal dibaca." }, { status: 500 });
  }
  if (!profile) {
    return Response.json({ error: "Program latihan belum dibuat." }, { status: 404 });
  }
  const today = dateKeyInTimezone(new Date(), profile.timezone);
  if (parsed.data.date > today) {
    return Response.json({ error: "Log hanya boleh untuk hari ini atau sebelumnya." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("planned_sessions")
    .select("exercise_ids")
    .eq("user_id", user.id)
    .eq("plan_date", parsed.data.date)
    .eq("slot", parsed.data.slot)
    .maybeSingle();
  if (sessionError) {
    return Response.json({ error: "Rencana sesi gagal dibaca." }, { status: 500 });
  }
  if (!session || !session.exercise_ids.includes(parsed.data.exerciseId)) {
    return Response.json({ error: "Gerakan tidak ada di sesi tersebut." }, { status: 404 });
  }

  const { data: exercise, error: exerciseError } = await supabase
    .from("exercises")
    .select("sets")
    .eq("id", parsed.data.exerciseId)
    .maybeSingle();
  if (exerciseError) {
    return Response.json({ error: "Detail gerakan gagal dibaca." }, { status: 500 });
  }
  if (!exercise) {
    return Response.json({ error: "Gerakan tidak ditemukan." }, { status: 404 });
  }
  if (parsed.data.setsDone > exercise.sets) {
    return Response.json({ error: "Jumlah set melebihi target gerakan." }, { status: 400 });
  }

  const doneAt =
    parsed.data.setsDone === exercise.sets ? new Date().toISOString() : null;
  const { data: log, error: saveError } = await supabase
    .from("session_logs")
    .upsert(
      {
        user_id: user.id,
        plan_date: parsed.data.date,
        slot: parsed.data.slot,
        exercise_id: parsed.data.exerciseId,
        sets_done: parsed.data.setsDone,
        done_at: doneAt,
      },
      { onConflict: "user_id,plan_date,slot,exercise_id" },
    )
    .select("*")
    .single();
  if (saveError) {
    return Response.json({ error: "Progres latihan gagal disimpan." }, { status: 500 });
  }

  return Response.json({ log });
}
