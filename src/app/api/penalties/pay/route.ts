import { z } from "zod";
import { dateKeyInTimezone } from "@/lib/engine/dates";
import { dateKeySchema } from "@/lib/engine/schema";
import { isPublicSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paymentSchema = z.object({
  date: dateKeySchema,
  slot: z.number().int().min(0).max(2),
});

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
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Data pembayaran tidak valid." }, { status: 400 });
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
  if (parsed.data.date >= today) {
    return Response.json({ error: "Denda hanya bisa dibayar setelah sesi terlewat." }, { status: 400 });
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
  if (!session) {
    return Response.json({ error: "Sesi latihan tidak ditemukan." }, { status: 404 });
  }

  const { data: logs, error: logsError } = await supabase
    .from("session_logs")
    .select("exercise_id, done_at")
    .eq("user_id", user.id)
    .eq("plan_date", parsed.data.date)
    .eq("slot", parsed.data.slot)
    .not("done_at", "is", null);
  if (logsError) {
    return Response.json({ error: "Progres sesi gagal dibaca." }, { status: 500 });
  }
  const completed = new Set(logs.map(({ exercise_id }) => exercise_id));
  if (
    session.exercise_ids.length === 0 ||
    session.exercise_ids.every((exerciseId) => completed.has(exerciseId))
  ) {
    return Response.json({ error: "Sesi tersebut sudah selesai." }, { status: 409 });
  }

  const { data: payment, error: paymentError } = await supabase
    .from("penalty_payments")
    .upsert(
      {
        user_id: user.id,
        plan_date: parsed.data.date,
        slot: parsed.data.slot,
      },
      {
        onConflict: "user_id,plan_date,slot",
        ignoreDuplicates: true,
      },
    )
    .select("*")
    .maybeSingle();
  if (paymentError) {
    return Response.json({ error: "Denda gagal ditandai lunas." }, { status: 500 });
  }

  return Response.json({ paid: true, payment });
}
