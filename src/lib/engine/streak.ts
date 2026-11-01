import { addDays } from "./dates";
import { createPlanForDate } from "./plan";
import type { Exercise, ProgramProfile } from "./types";
import { sessionKey } from "./types";

export function calculateStreak(
  profile: ProgramProfile,
  exercises: Exercise[],
  today: string,
  completedSessions: ReadonlySet<string>,
): number {
  let streak = 0;

  for (let date = today; date >= profile.startDate; date = addDays(date, -1)) {
    const sessions = createPlanForDate(profile, exercises, date);
    if (sessions.length === 0) continue;

    const isComplete = sessions.every((session) =>
      completedSessions.has(sessionKey(date, session.slot)),
    );
    if (!isComplete && date !== today) break;
    if (isComplete) streak += 1;
  }

  return streak;
}
