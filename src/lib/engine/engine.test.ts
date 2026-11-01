import { describe, expect, it } from "vitest";
import { dateKeyInTimezone, epochDay, monthDateKeys } from "./dates";
import {
  calculateStreakFromSessions,
  getCalendarStatuses,
  icalEscape,
  localDateTimeToUtc,
  toICalendarDate,
} from "./calendar";
import { PENALTY_EXERCISES, unpaidPenalties } from "./penalty";
import {
  createPlanForDate,
  eligibleExercises,
  isTrainingDate,
  TRAINING_DAY_PATTERNS,
} from "./plan";
import { profileSetupSchema } from "./schema";
import { calculateStreak } from "./streak";
import type { Exercise, ProgramProfile } from "./types";
import { sessionKey } from "./types";

const profile: ProgramProfile = {
  gender: "m",
  age: 30,
  mode: "c",
  equipment: [],
  targets: ["dada", "punggung", "kaki", "core"],
  daysPerWeek: 3,
  slots: ["07:00"],
  startDate: "2026-01-01",
  timezone: "Asia/Jakarta",
};

const exercises: Exercise[] = [
  {
    id: "pushup",
    name: "Push-up",
    name_en: "Push-up",
    target: "dada",
    mode: "c",
    equipment: "none",
    gender: "b",
    sets: 3,
    reps: "10-15",
    tips: "",
    images: [],
    video_id: null,
    source: "curated",
    license: null,
    needs_review: false,
  },
  {
    id: "wide-pushup",
    name: "Push-up lebar",
    name_en: "Wide push-up",
    target: "dada",
    mode: "c",
    equipment: "none",
    gender: "m",
    sets: 3,
    reps: "10-12",
    tips: "",
    images: [],
    video_id: null,
    source: "curated",
    license: null,
    needs_review: false,
  },
  {
    id: "dumbbell-row",
    name: "Row dumbbell",
    name_en: "Dumbbell row",
    target: "punggung",
    mode: "c",
    equipment: "db",
    gender: "b",
    sets: 3,
    reps: "10",
    tips: "",
    images: [],
    video_id: null,
    source: "curated",
    license: null,
    needs_review: false,
  },
  {
    id: "bar-row",
    name: "Australian row",
    name_en: "Inverted row",
    target: "punggung",
    mode: "c",
    equipment: "bar",
    gender: "b",
    sets: 3,
    reps: "8-12",
    tips: "",
    images: [],
    video_id: null,
    source: "curated",
    license: null,
    needs_review: false,
  },
  {
    id: "gym-only",
    name: "Bench press",
    name_en: "Bench press",
    target: "dada",
    mode: "g",
    equipment: "",
    gender: "b",
    sets: 3,
    reps: "8-12",
    tips: "",
    images: [],
    video_id: null,
    source: "curated",
    license: null,
    needs_review: false,
  },
  {
    id: "female-only",
    name: "Donkey kick",
    name_en: "Donkey kick",
    target: "glute",
    mode: "c",
    equipment: "none",
    gender: "f",
    sets: 3,
    reps: "15",
    tips: "",
    images: [],
    video_id: null,
    source: "curated",
    license: null,
    needs_review: false,
  },
];

describe("profileSetupSchema", () => {
  const validSetup = {
    name: "Pengguna",
    gender: "m",
    age: 30,
    mode: "c",
    equipment: [],
    targets: ["dada"],
    daysPerWeek: 3,
    slots: ["07:00", "18:00"],
    timezone: "Asia/Jakarta",
  };

  it("accepts distinct session times", () => {
    expect(profileSetupSchema.safeParse(validSetup).success).toBe(true);
  });

  it("rejects duplicate session times", () => {
    expect(
      profileSetupSchema.safeParse({ ...validSetup, slots: ["07:00", "07:00"] })
        .success,
    ).toBe(false);
  });
});

describe("jadwal latihan", () => {
  it.each([
    [2, [1, 4]],
    [3, [1, 3, 5]],
    [4, [1, 2, 4, 5]],
    [5, [1, 2, 3, 5, 6]],
    [6, [1, 2, 3, 4, 5, 6]],
    [7, [0, 1, 2, 3, 4, 5, 6]],
  ] as const)("menggunakan pola %i hari yang ditentukan", (days, pattern) => {
    expect(TRAINING_DAY_PATTERNS[days]).toEqual(pattern);
    for (const day of pattern) {
      const date = [
        "2026-06-07",
        "2026-06-08",
        "2026-06-09",
        "2026-06-10",
        "2026-06-11",
        "2026-06-12",
        "2026-06-13",
      ][day];
      expect(isTrainingDate(date, days)).toBe(true);
    }
  });

  it("merotasi fokus secara deterministik selama empat minggu", () => {
    const weeklyProfile = { ...profile, daysPerWeek: 3 as const };
    const focusByWeek = Array.from({ length: 4 }, (_, weekIndex) => {
      const date = `2026-06-${String(1 + weekIndex * 7).padStart(2, "0")}`;
      return createPlanForDate(weeklyProfile, exercises, date)[0]?.focus;
    });
    const firstWeekOrdinal = Math.floor((epochDay("2026-06-01") - 4) / 7) * 3;
    const expected = Array.from(
      { length: 4 },
      (_, index) =>
        weeklyProfile.targets[
          (((firstWeekOrdinal + index * 3) % weeklyProfile.targets.length) +
            weeklyProfile.targets.length) %
            weeklyProfile.targets.length
        ],
    );

    expect(focusByWeek).toEqual(expected);
    expect(new Set(focusByWeek).size).toBe(4);
  });

  it("memfilter mode, gender, dan peralatan tanpa memfilter umur", () => {
    expect(
      eligibleExercises(profile, exercises).map((exercise) => exercise.id),
    ).toEqual(["pushup", "wide-pushup"]);

    expect(
      eligibleExercises(
        { ...profile, gender: "f" },
        exercises,
      ).map((exercise) => exercise.id),
    ).toContain("female-only");

    expect(
      eligibleExercises(
        { ...profile, equipment: ["db"] },
        exercises,
      ).map((exercise) => exercise.id),
    ).toContain("dumbbell-row");
  });

  it("menambah tiga gerakan target lain ketika fokus memiliki kurang dari tiga", () => {
    const equippedProfile = { ...profile, equipment: ["db", "bar"] };
    const plan = createPlanForDate(equippedProfile, exercises, "2026-06-08");
    expect(plan[0].exerciseIds.length).toBe(4);
    expect(plan[0].exerciseIds).toContain("dumbbell-row");
  });
});

describe("denda", () => {
  it("menghasilkan denda yang sama untuk profil tanpa memandang umur", () => {
    const dueAtAge18 = unpaidPenalties(
      { ...profile, age: 18 },
      exercises,
      "2026-01-12",
      new Set(),
      new Set(),
    );
    const dueAtAge80 = unpaidPenalties(
      { ...profile, age: 80 },
      exercises,
      "2026-01-12",
      new Set(),
      new Set(),
    );
    expect(dueAtAge18).toEqual(dueAtAge80);
    const latest = dueAtAge18[0];
    const expectedIndex =
      (epochDay(latest.date) + latest.slot) % PENALTY_EXERCISES.length;
    expect(latest.text).toBe(PENALTY_EXERCISES[expectedIndex]);
  });

  it("mengabaikan sesi selesai dan denda yang sudah dibayar", () => {
    const sessions = createPlanForDate(profile, exercises, "2026-01-05");
    const completed = new Set([sessionKey("2026-01-05", sessions[0].slot)]);
    const paid = new Set([sessionKey("2026-01-07", 0)]);
    const penalties = unpaidPenalties(profile, exercises, "2026-01-08", completed, paid);

    expect(penalties.some(({ date }) => date === "2026-01-05")).toBe(false);
    expect(penalties.some(({ date }) => date === "2026-01-07")).toBe(false);
  });

  it("hanya mengembalikan delapan denda terbaru dan tidak memasukkan hari ini", () => {
    const penalties = unpaidPenalties(
      { ...profile, startDate: "2026-01-01", daysPerWeek: 7 },
      exercises,
      "2026-01-15",
      new Set(),
      new Set(),
    );
    expect(penalties).toHaveLength(8);
    expect(penalties[0].date).toBe("2026-01-14");
    expect(penalties.some(({ date }) => date === "2026-01-15")).toBe(false);
  });
});

describe("streak dan tanggal", () => {
  it("melewati hari istirahat dan mengabaikan sesi hari ini yang belum selesai", () => {
    const completed = new Set([
      sessionKey("2026-01-05", 0),
      sessionKey("2026-01-07", 0),
      sessionKey("2026-01-09", 0),
    ]);

    expect(calculateStreak(profile, exercises, "2026-01-12", completed)).toBe(3);
  });

  it("menentukan jumlah hari bulan dengan benar di batas bulan", () => {
    expect(monthDateKeys("2026-02")).toHaveLength(28);
    expect(monthDateKeys("2024-02")).toHaveLength(29);
    expect(monthDateKeys("2026-12").at(-1)).toBe("2026-12-31");
  });

  it("menghitung tanggal lokal menurut zona waktu pengguna", () => {
    const instant = new Date("2026-01-01T23:30:00.000Z");
    expect(dateKeyInTimezone(instant, "Asia/Jakarta")).toBe("2026-01-02");
    expect(dateKeyInTimezone(instant, "America/Los_Angeles")).toBe("2026-01-01");
  });

  it("membedakan status kalender untuk sesi penuh, sebagian, terlewat, libur, dan mendatang", () => {
    const sessions = [
      { date: "2026-01-05", slot: 0, focus: "dada" as const, exerciseIds: ["pushup"] },
      { date: "2026-01-06", slot: 0, focus: "dada" as const, exerciseIds: ["pushup", "wide-pushup"] },
      { date: "2026-01-07", slot: 0, focus: "dada" as const, exerciseIds: ["pushup"] },
    ];
    const statuses = getCalendarStatuses(
      ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"],
      sessions,
      [
        { date: "2026-01-05", slot: 0, exerciseId: "pushup", doneAt: "2026-01-05T02:00:00Z" },
        { date: "2026-01-06", slot: 0, exerciseId: "pushup", doneAt: "2026-01-06T02:00:00Z" },
      ],
      "2026-01-09",
    );
    expect(statuses.map(({ status }) => status)).toEqual([
      "complete",
      "partial",
      "missed",
      "rest",
      "upcoming",
    ]);
  });

  it("menghitung streak kalender melewati hari istirahat", () => {
    const sessions = [
      { date: "2026-01-05", slot: 0, focus: "dada" as const, exerciseIds: ["pushup"] },
      { date: "2026-01-07", slot: 0, focus: "dada" as const, exerciseIds: ["pushup"] },
      { date: "2026-01-09", slot: 0, focus: "dada" as const, exerciseIds: ["pushup"] },
    ];
    const logs = sessions.map((session) => ({
      date: session.date,
      slot: session.slot,
      exerciseId: "pushup",
      doneAt: `${session.date}T02:00:00Z`,
    }));
    expect(calculateStreakFromSessions("2026-01-05", "2026-01-12", sessions, logs)).toBe(3);
  });

  it("mengonversi waktu lokal ke UTC, termasuk perbedaan zona waktu", () => {
    expect(
      localDateTimeToUtc("2026-01-02", "07:00", "Asia/Jakarta").toISOString(),
    ).toBe("2026-01-02T00:00:00.000Z");
  });

  it("memformat waktu iCalendar dan melakukan escape teks", () => {
    expect(toICalendarDate(new Date("2026-01-02T00:00:00Z"))).toBe("20260102T000000Z");
    expect(icalEscape("Latihan, fokus;\nkuat")).toBe("Latihan\\, fokus\\;\\nkuat");
  });
});
