export type Gender = "m" | "f";
export type TrainingMode = "c" | "g";
export type DaysPerWeek = 2 | 3 | 4 | 5 | 6 | 7;
export type ExerciseTarget =
  | "dada"
  | "punggung"
  | "bahu"
  | "lengan"
  | "kaki"
  | "glute"
  | "core";

export type Exercise = {
  id: string;
  name: string;
  name_en: string;
  target: ExerciseTarget;
  mode: TrainingMode;
  equipment: string;
  gender: "b" | Gender;
  sets: number;
  reps: string;
  tips: string;
  images: string[];
  video_id: string | null;
  source: string | null;
  license: string | null;
  needs_review: boolean;
};

export type ProgramProfile = {
  gender: Gender;
  age: number;
  mode: TrainingMode;
  equipment: string[];
  targets: ExerciseTarget[];
  daysPerWeek: DaysPerWeek;
  slots: string[];
  startDate: string;
  timezone: string;
};

export type PlannedSession = {
  date: string;
  slot: number;
  focus: ExerciseTarget;
  exerciseIds: string[];
};

export type Penalty = {
  date: string;
  slot: number;
  text: string;
};

export function sessionKey(date: string, slot: number): string {
  return `${date}:${slot}`;
}
