import { timingSafeEqual } from "node:crypto";
import webpush, { type PushSubscription } from "web-push";
import { dateKeyInTimezone } from "@/lib/engine/dates";
import { localDateTimeToUtc } from "@/lib/engine/calendar";
import { isTrustedPushEndpoint } from "@/lib/push";
import type { Exercise, ProgramProfile } from "@/lib/engine/types";
import { freezePlansInRange } from "@/lib/server/freeze-plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const keys = candidate.keys;
  return (
    typeof candidate.endpoint === "string" &&
    isTrustedPushEndpoint(candidate.endpoint) &&
    typeof keys === "object" &&
    keys !== null &&
    typeof (keys as Record<string, unknown>).p256dh === "string" &&
    typeof (keys as Record<string, unknown>).auth === "string"
  );
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM;
  const appUrl = process.env.APP_URL;
  const vapidConfig =
    publicKey && privateKey && subject
      ? { publicKey, privateKey, subject }
      : null;
  const pushConfigured = Boolean(vapidConfig);
  const emailConfigured = Boolean(resendApiKey && resendFrom && appUrl);
  if (!cronSecret || (!pushConfigured && !emailConfigured)) {
    return Response.json({ error: "Pengiriman pengingat belum dikonfigurasi." }, { status: 503 });
  }
  if (!isAuthorized(request, cronSecret)) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
    if (vapidConfig) {
      webpush.setVapidDetails(
        vapidConfig.subject,
        vapidConfig.publicKey,
        vapidConfig.privateKey,
      );
    }
  } catch {
    return Response.json({ error: "Konfigurasi pengiriman push tidak valid." }, { status: 503 });
  }
  const [{ data: profiles, error: profilesError }, { data: catalog, error: catalogError }] =
    await Promise.all([
      admin.from("profiles").select("*"),
      admin.from("exercises").select("*"),
    ]);
  if (profilesError || catalogError) {
    return Response.json({ error: "Data pengingat tidak dapat dibaca." }, { status: 500 });
  }

  const now = new Date();
  let pushSent = 0;
  let emailSent = 0;
  let skipped = 0;
  let failures = 0;

  for (const profile of profiles) {
    const today = dateKeyInTimezone(now, profile.timezone);
    if (today < profile.start_date) continue;
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
      admin,
      profile.id,
      engineProfile,
      catalog as Exercise[],
      today,
      today,
    );
    if (frozen.error) {
      failures += 1;
      continue;
    }

    for (const session of frozen.sessions) {
      const time = profile.slots[session.slot];
      if (!time) continue;
      let sessionStart: Date;
      try {
        sessionStart = localDateTimeToUtc(session.date, time, profile.timezone);
      } catch {
        failures += 1;
        continue;
      }
      const minutesUntilWorkout = (sessionStart.getTime() - now.getTime()) / 60_000;
      if (minutesUntilWorkout < 5 || minutesUntilWorkout > 15) continue;

      const message = `Sesi ${session.slot + 1} dengan fokus ${session.focus} dimulai sebentar lagi.`;
      if (pushConfigured) {
        const { error: deliveryError } = await admin.from("push_deliveries").insert({
          user_id: profile.id,
          plan_date: session.date,
          slot: session.slot,
          channel: "push",
        });
        if (deliveryError?.code === "23505") {
          skipped += 1;
        } else if (deliveryError) {
          failures += 1;
        } else {
          const { data: subscriptions, error: subscriptionsError } = await admin
            .from("push_subscriptions")
            .select("endpoint, keys")
            .eq("user_id", profile.id);
          if (subscriptionsError) {
            await admin
              .from("push_deliveries")
              .delete()
              .eq("user_id", profile.id)
              .eq("plan_date", session.date)
              .eq("slot", session.slot)
              .eq("channel", "push");
            failures += 1;
          } else {
            let delivered = false;
            for (const row of subscriptions) {
              const subscription = { endpoint: row.endpoint, keys: row.keys };
              if (!isPushSubscription(subscription)) {
                failures += 1;
                continue;
              }
              try {
                await webpush.sendNotification(
                  subscription,
                  JSON.stringify({
                    title: "Waktunya latihan",
                    body: message,
                    url: "/",
                    tag: `workout-${session.date}-${session.slot}`,
                  }),
                  { TTL: 300 },
                );
                delivered = true;
              } catch (error) {
                const statusCode =
                  typeof error === "object" && error !== null && "statusCode" in error
                    ? error.statusCode
                    : undefined;
                if (statusCode === 404 || statusCode === 410) {
                  await admin
                    .from("push_subscriptions")
                    .delete()
                    .eq("user_id", profile.id)
                    .eq("endpoint", row.endpoint);
                } else {
                  failures += 1;
                }
              }
            }

            if (delivered) {
              pushSent += 1;
            } else {
              await admin
                .from("push_deliveries")
                .delete()
                .eq("user_id", profile.id)
                .eq("plan_date", session.date)
                .eq("slot", session.slot)
                .eq("channel", "push");
              skipped += 1;
            }
          }
        }
      }

      if (emailConfigured && profile.email_reminders) {
        const { error: emailDeliveryError } = await admin.from("push_deliveries").insert({
          user_id: profile.id,
          plan_date: session.date,
          slot: session.slot,
          channel: "email",
        });
        if (emailDeliveryError?.code === "23505") {
          skipped += 1;
          continue;
        }
        if (emailDeliveryError) {
          failures += 1;
          continue;
        }
        try {
          const { data, error } = await admin.auth.admin.getUserById(profile.id);
          if (error || !data.user?.email) {
            throw new Error("Email akun tidak tersedia.");
          }
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: resendFrom,
              to: [data.user.email],
              subject: "Pengingat latihan Bangun Badan",
              text: `${message}\n\nBuka program latihan: ${appUrl}`,
            }),
          });
          if (!response.ok) throw new Error("Penyedia email menolak pengiriman.");
          emailSent += 1;
        } catch {
          await admin
            .from("push_deliveries")
            .delete()
            .eq("user_id", profile.id)
            .eq("plan_date", session.date)
            .eq("slot", session.slot)
            .eq("channel", "email");
          failures += 1;
        }
      }
    }
  }

  return Response.json({ pushSent, emailSent, skipped, failures });
}
