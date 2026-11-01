import { z } from "zod";
import { dateKeyInTimezone } from "@/lib/engine/dates";
import {
  daysPerWeekSchema,
  exerciseTargetSchema,
  genderSchema,
  trainingModeSchema,
} from "@/lib/engine/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPublicSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    gender: genderSchema.optional(),
    age: z.number().int().positive().max(120).optional(),
    mode: trainingModeSchema.optional(),
    equipment: z.array(z.enum(["chair", "bar", "db", "band"])).optional(),
    targets: z.array(exerciseTargetSchema).min(1).optional(),
    days_per_week: daysPerWeekSchema.optional(),
    slots: z
      .array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/))
      .min(1)
      .max(3)
      .refine((slots) => new Set(slots).size === slots.length, {
        message: "Jam untuk setiap sesi harus berbeda.",
      })
      .optional(),
    mood: z.enum(["semangat", "tenang", "kesal", "marah"]).optional(),
    email_reminders: z.boolean().optional(),
    timezone: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Setidaknya satu nilai profil harus diubah.",
  });

export async function GET() {
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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    return Response.json({ error: "Profil gagal dibaca." }, { status: 500 });
  }
  if (!profile) {
    return Response.json({ error: "Program latihan belum dibuat." }, { status: 404 });
  }

  return Response.json({
    profile: {
      ...profile,
      email: user.email ?? null,
    },
  });
}

export async function PATCH(request: Request) {
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Data profil tidak valid." },
      { status: 400 },
    );
  }
  if (parsed.data.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
    } catch {
      return Response.json({ error: "Zona waktu tidak valid." }, { status: 400 });
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select("*")
    .maybeSingle();
  if (error) {
    return Response.json({ error: "Perubahan profil gagal disimpan." }, { status: 500 });
  }
  if (!updated) {
    return Response.json({ error: "Profil latihan belum dibuat." }, { status: 404 });
  }

  return Response.json({ profile: updated });
}

export async function DELETE() {
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

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return Response.json({ error: "Penghapusan akun belum dikonfigurasi." }, { status: 503 });
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return Response.json({ error: "Akun gagal dihapus." }, { status: 500 });
  }
  await supabase.auth.signOut();
  return Response.json({ deleted: true });
}

export async function POST(request: Request) {
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  const bodySchema = z.object({ action: z.literal("restart") });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }
  if (!bodySchema.safeParse(body).success) {
    return Response.json({ error: "Aksi profil tidak valid." }, { status: 400 });
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
    return Response.json({ error: "Profil gagal dibaca." }, { status: 500 });
  }
  if (!profile) {
    return Response.json({ error: "Program latihan belum dibuat." }, { status: 404 });
  }

  const startDate = dateKeyInTimezone(new Date(), profile.timezone);
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ start_date: startDate })
    .eq("id", user.id)
    .select("*")
    .single();
  if (error) {
    return Response.json({ error: "Program gagal dimulai ulang." }, { status: 500 });
  }
  return Response.json({ profile: updated });
}
