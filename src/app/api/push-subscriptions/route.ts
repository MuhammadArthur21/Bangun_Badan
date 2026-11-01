import { z } from "zod";
import { isTrustedPushEndpoint } from "@/lib/push";
import { isPublicSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine(isTrustedPushEndpoint, "Endpoint push harus berasal dari penyedia push tepercaya."),
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(10).max(100),
  }),
});

const endpointSchema = z.object({
  endpoint: subscriptionSchema.shape.endpoint,
});

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user, error };
}

export async function GET() {
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return Response.json({ error: "Notifikasi push belum dikonfigurasi." }, { status: 503 });
  }
  const { user, error } = await getAuthenticatedUser();
  if (error || !user) {
    return Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }
  return Response.json({ publicKey });
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
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Langganan push tidak valid." },
      { status: 400 },
    );
  }

  const { supabase, user, error: authError } = await getAuthenticatedUser();
  if (authError || !user) {
    return Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return Response.json({ error: "Langganan notifikasi gagal disimpan." }, { status: 500 });
  }
  return Response.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  if (!isPublicSupabaseConfigured()) {
    return Response.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }
  const parsed = endpointSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Endpoint langganan tidak valid." }, { status: 400 });
  }

  const { supabase, user, error: authError } = await getAuthenticatedUser();
  if (authError || !user) {
    return Response.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data.endpoint);
  if (error) {
    return Response.json({ error: "Langganan notifikasi gagal dihapus." }, { status: 500 });
  }
  return Response.json({ subscribed: false });
}
