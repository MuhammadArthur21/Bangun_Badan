import { z } from "zod";
import { epochDay, monthDateKeys } from "./dates";

export const genderSchema = z.enum(["m", "f"]);
export const trainingModeSchema = z.enum(["c", "g"]);
export const exerciseTargetSchema = z.enum([
  "dada",
  "punggung",
  "bahu",
  "lengan",
  "kaki",
  "glute",
  "core",
]);
export const daysPerWeekSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);
export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => {
      try {
        epochDay(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Tanggal tidak valid." },
  );
export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(
    (value) => {
      try {
        monthDateKeys(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Bulan tidak valid." },
  );

export const exerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  name_en: z.string().min(1),
  target: exerciseTargetSchema,
  mode: trainingModeSchema,
  equipment: z.string(),
  gender: z.enum(["b", "m", "f"]),
  sets: z.number().int().positive(),
  reps: z.string().min(1),
  tips: z.string(),
  images: z.array(z.string().url()),
  video_id: z.string().nullable(),
  source: z.string().nullable(),
  license: z.string().nullable(),
  needs_review: z.boolean(),
});

export const profileSetupSchema = z.object({
  name: z.string().min(1),
  gender: genderSchema,
  age: z.number().int().positive().max(120),
  mode: trainingModeSchema,
  equipment: z.array(z.enum(["chair", "bar", "db", "band"])),
  targets: z.array(exerciseTargetSchema).min(1),
  daysPerWeek: daysPerWeekSchema,
  slots: z
    .array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/))
    .min(1)
    .max(3)
    .refine((slots) => new Set(slots).size === slots.length, {
      message: "Jam untuk setiap sesi harus berbeda.",
    }),
  timezone: z.string().min(1),
});

export type ProfileSetup = z.infer<typeof profileSetupSchema>;
