import { addDays, epochDay } from "./dates";
import { createPlanForDate } from "./plan";
import type {
  Exercise,
  Penalty,
  PlannedSession,
  ProgramProfile,
} from "./types";
import { sessionKey } from "./types";

export const PENALTY_EXERCISES = [
  "25 push-up",
  "40 squat",
  "1 menit plank",
  "30 mountain climber",
  "20 burpee",
  "30 leg raise",
  "2x15 lunge",
] as const;

export const MAX_UNPAID_PENALTIES = 8;

export function unpaidPenalties(
  profile: ProgramProfile,
  exercises: Exercise[],
  today: string,
  completedSessions: ReadonlySet<string>,
  paidSessions: ReadonlySet<string>,
): Penalty[] {
  const plans: PlannedSession[] = [];

  for (
    let date = profile.startDate;
    date < today;
    date = addDays(date, 1)
  ) {
    plans.push(...createPlanForDate(profile, exercises, date));
  }

  return unpaidPenaltiesForPlans(
    plans,
    profile.startDate,
    today,
    completedSessions,
    paidSessions,
  );
}

export function unpaidPenaltiesForPlans(
  plannedSessions: readonly PlannedSession[],
  startDate: string,
  today: string,
  completedSessions: ReadonlySet<string>,
  paidSessions: ReadonlySet<string>,
): Penalty[] {
  const penalties = plannedSessions.flatMap((session) => {
    if (
      session.date < startDate ||
      session.date >= today ||
      session.exerciseIds.length === 0
    ) {
      return [];
    }

    const key = sessionKey(session.date, session.slot);
    if (completedSessions.has(key) || paidSessions.has(key)) return [];

    const index =
      ((epochDay(session.date) + session.slot) % PENALTY_EXERCISES.length +
        PENALTY_EXERCISES.length) %
      PENALTY_EXERCISES.length;
    return [{ date: session.date, slot: session.slot, text: PENALTY_EXERCISES[index] }];
  });

  return penalties
    .sort((left, right) =>
      right.date === left.date
        ? right.slot - left.slot
        : right.date.localeCompare(left.date),
    )
    .slice(0, MAX_UNPAID_PENALTIES);
}
