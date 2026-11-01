import { addDays, epochDay, weekday } from "./dates";
import type {
  Exercise,
  PlannedSession,
  ProgramProfile,
} from "./types";

export const TRAINING_DAY_PATTERNS: Record<
  ProgramProfile["daysPerWeek"],
  number[]
> = {
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export function eligibleExercises(
  profile: Pick<ProgramProfile, "gender" | "mode" | "equipment">,
  exercises: Exercise[],
): Exercise[] {
  return exercises.filter((exercise) => {
    if (exercise.mode !== profile.mode) return false;
    if (exercise.gender !== "b" && exercise.gender !== profile.gender) {
      return false;
    }

    return (
      profile.mode === "g" ||
      exercise.equipment === "none" ||
      profile.equipment.includes(exercise.equipment)
    );
  });
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function isTrainingDate(
  date: string,
  daysPerWeek: ProgramProfile["daysPerWeek"],
): boolean {
  return TRAINING_DAY_PATTERNS[daysPerWeek].includes(weekday(date));
}

export function createPlanForDate(
  profile: ProgramProfile,
  exercises: Exercise[],
  date: string,
): PlannedSession[] {
  if (date < profile.startDate || !isTrainingDate(date, profile.daysPerWeek)) {
    return [];
  }
  if (profile.targets.length === 0) {
    throw new RangeError("Program harus memiliki minimal satu target.");
  }
  if (profile.slots.length === 0) {
    throw new RangeError("Program harus memiliki minimal satu sesi per hari.");
  }

  const pattern = TRAINING_DAY_PATTERNS[profile.daysPerWeek];
  const dayIndex = pattern.indexOf(weekday(date));
  const week = Math.floor((epochDay(date) - 4) / 7);
  const ordinal = week * pattern.length + dayIndex;
  const focus = profile.targets[positiveModulo(ordinal, profile.targets.length)];
  const eligible = eligibleExercises(profile, exercises);
  const focusExercises = eligible.filter((exercise) => exercise.target === focus);
  const candidates =
    focusExercises.length < 3
      ? [
          ...focusExercises,
          ...eligible
            .filter((exercise) => exercise.target !== focus)
            .slice(0, 3),
        ]
      : focusExercises;
  const count = Math.min(4, candidates.length);

  return profile.slots.map((_, slot) => ({
    date,
    slot,
    focus,
    exerciseIds: Array.from({ length: count }, (_, index) => {
      const candidateIndex = positiveModulo(ordinal + slot * 2 + index, candidates.length);
      return candidates[candidateIndex].id;
    }),
  }));
}

export function listTrainingDates(
  startDate: string,
  endDateInclusive: string,
  daysPerWeek: ProgramProfile["daysPerWeek"],
): string[] {
  if (startDate > endDateInclusive) return [];

  const dates: string[] = [];
  for (let date = startDate; date <= endDateInclusive; date = addDays(date, 1)) {
    if (isTrainingDate(date, daysPerWeek)) dates.push(date);
  }
  return dates;
}
