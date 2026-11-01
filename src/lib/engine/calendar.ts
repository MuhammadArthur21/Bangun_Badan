import { dateKeyInTimezone } from "./dates";
import type { PlannedSession } from "./types";
import { sessionKey } from "./types";

export type CalendarStatus =
  | "complete"
  | "partial"
  | "missed"
  | "rest"
  | "upcoming";

export type CalendarLog = {
  date: string;
  slot: number;
  exerciseId: string;
  doneAt: string | null;
};

export function getCalendarStatuses(
  dates: readonly string[],
  sessions: readonly PlannedSession[],
  logs: readonly CalendarLog[],
  today: string,
): { date: string; status: CalendarStatus; completedSessions: number; totalSessions: number }[] {
  const sessionsByDate = new Map<string, PlannedSession[]>();
  for (const session of sessions) {
    const datedSessions = sessionsByDate.get(session.date) ?? [];
    datedSessions.push(session);
    sessionsByDate.set(session.date, datedSessions);
  }

  const completedExercises = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.doneAt) continue;
    const key = sessionKey(log.date, log.slot);
    const exerciseIds = completedExercises.get(key) ?? new Set<string>();
    exerciseIds.add(log.exerciseId);
    completedExercises.set(key, exerciseIds);
  }

  return dates.map((date) => {
    const datedSessions = sessionsByDate.get(date) ?? [];
    if (date > today) {
      return {
        date,
        status: "upcoming" as const,
        completedSessions: 0,
        totalSessions: datedSessions.length,
      };
    }
    if (datedSessions.length === 0) {
      return {
        date,
        status: date < today ? ("rest" as const) : ("upcoming" as const),
        completedSessions: 0,
        totalSessions: 0,
      };
    }

    const completedCount = datedSessions.filter(
      ({ date: sessionDate, slot, exerciseIds }) =>
        exerciseIds.length > 0 &&
        exerciseIds.every((exerciseId) =>
          completedExercises.get(sessionKey(sessionDate, slot))?.has(exerciseId),
        ),
    ).length;
    const hasStarted = datedSessions.some(({ date: sessionDate, slot, exerciseIds }) =>
      exerciseIds.some((exerciseId) =>
        completedExercises.get(sessionKey(sessionDate, slot))?.has(exerciseId),
      ),
    );

    let status: CalendarStatus;
    if (completedCount === datedSessions.length) status = "complete";
    else if (completedCount > 0 || hasStarted) status = "partial";
    else status = date < today ? "missed" : "upcoming";

    return {
      date,
      status,
      completedSessions: completedCount,
      totalSessions: datedSessions.length,
    };
  });
}

export function calculateStreakFromSessions(
  startDate: string,
  today: string,
  sessions: readonly PlannedSession[],
  logs: readonly CalendarLog[],
): number {
  const statuses = getCalendarStatuses(
    sessions
      .filter(({ date }) => date >= startDate && date <= today)
      .map(({ date }) => date)
      .filter((date, index, dates) => dates.indexOf(date) === index)
      .sort(),
    sessions,
    logs,
    today,
  );
  let streak = 0;
  for (let index = statuses.length - 1; index >= 0; index -= 1) {
    const day = statuses[index];
    if (day.status === "rest") continue;
    if (day.date === today && day.status !== "complete") continue;
    if (day.status !== "complete") break;
    streak += 1;
  }
  return streak;
}

export function localDateTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const fields = new Map(parts.map(({ type, value }) => [type, Number(value)]));
    const localAsUtc = Date.UTC(
      fields.get("year") ?? 0,
      (fields.get("month") ?? 1) - 1,
      fields.get("day") ?? 1,
      fields.get("hour") ?? 0,
      fields.get("minute") ?? 0,
    );
    const difference =
      Date.UTC(year, month - 1, day, hour, minute) - localAsUtc;
    if (difference === 0) break;
    candidate = new Date(candidate.getTime() + difference);
  }

  const confirmedDate = dateKeyInTimezone(candidate, timezone);
  const confirmedTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(candidate);
  if (confirmedDate !== date || confirmedTime !== time) {
    throw new RangeError(
      `Waktu lokal ${date} ${time} tidak ada di zona waktu ${timezone}.`,
    );
  }

  return candidate;
}

export function toICalendarDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function icalEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
