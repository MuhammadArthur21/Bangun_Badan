import { addDays, dateKeyInTimezone } from "@/lib/engine/dates";
import {
  icalEscape,
  localDateTimeToUtc,
  toICalendarDate,
} from "@/lib/engine/calendar";
import type { Exercise, ProgramProfile } from "@/lib/engine/types";
import { freezePlansInRange } from "@/lib/server/freeze-plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ token: string[] }>;
};

function calendarResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="bangun-badan.ics"',
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const calendarToken = token.at(-1)?.replace(/\.ics$/, "");
  if (!calendarToken) {
    return calendarResponse("Kalender tidak ditemukan.\r\n", 404);
  }
  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch {
    return calendarResponse("Kalender belum dikonfigurasi.\r\n", 503);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("ics_token", calendarToken)
    .maybeSingle();
  if (profileError) {
    return calendarResponse("Kalender tidak dapat dibaca.\r\n", 500);
  }
  if (!profile) {
    return calendarResponse("Kalender tidak ditemukan.\r\n", 404);
  }

  const today = dateKeyInTimezone(new Date(), profile.timezone);
  const endDate = addDays(today, 60);
  const { data: catalog, error: catalogError } = await supabase
    .from("exercises")
    .select("*");
  if (catalogError) {
    return calendarResponse("Katalog latihan tidak dapat dibaca.\r\n", 500);
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
    profile.id,
    engineProfile,
    catalog as Exercise[],
    today > profile.start_date ? today : profile.start_date,
    endDate,
  );
  if (frozen.error) return calendarResponse(`${frozen.error}\r\n`, 500);

  const now = new Date();
  const events: string[] = [];
  for (const session of frozen.sessions) {
    const time = profile.slots[session.slot];
    if (!time) {
      return calendarResponse(
        `Jam sesi ${session.slot + 1} tidak ditemukan pada program.\r\n`,
        422,
      );
    }

    let start: Date;
    try {
      start = localDateTimeToUtc(session.date, time, profile.timezone);
    } catch (error) {
      return calendarResponse(
        `${
          error instanceof Error ? error.message : "Waktu sesi kalender tidak valid."
        }\r\n`,
        422,
      );
    }
    const uid = `${session.date}-${session.slot}-${profile.id}@bangun-badan`;
    const summary = icalEscape(`Latihan: ${session.focus}`);
    events.push(
      [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${toICalendarDate(now)}`,
        `DTSTART:${toICalendarDate(start)}`,
        `DTEND:${toICalendarDate(new Date(start.getTime() + 45 * 60 * 1000))}`,
        `SUMMARY:${summary}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Waktunya latihan Bangun Badan",
        "TRIGGER:-PT10M",
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n"),
    );
  }

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bangun Badan//Kalender Latihan//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Bangun Badan",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
  return calendarResponse(`${calendar}\r\n`);
}
