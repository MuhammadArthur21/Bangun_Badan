import { describe, expect, it } from "vitest";
import exercises from "./exercises-curated.json";
import videoIds from "./video-ids.json";
import { eligibleExercises } from "../src/lib/engine/plan";
import { exerciseSchema } from "../src/lib/engine/schema";

const catalog = exerciseSchema.array().parse(exercises);

describe("katalog latihan curated", () => {
  it("memuat semua 109 gerakan dengan ID unik", () => {
    const ids = exercises.map(({ id }) => id);
    expect(exercises).toHaveLength(109);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("menandai seluruh gerakan gym perempuan untuk ditinjau", () => {
    const femaleGymExercises = exercises.filter(
      ({ mode, gender }) => mode === "g" && gender === "f",
    );
    expect(femaleGymExercises).toHaveLength(23);
    expect(femaleGymExercises.every(({ needs_review }) => needs_review)).toBe(true);
    expect(
      exercises
        .filter(({ mode, gender }) => mode !== "g" || gender !== "f")
        .every(({ needs_review }) => !needs_review),
    ).toBe(true);
  });

  it("tidak mengarang gambar, lisensi, atau ID video", () => {
    expect(videoIds).toEqual({});
    expect(exercises.every(({ images }) => images.length === 0)).toBe(true);
    expect(exercises.every(({ video_id }) => video_id === null)).toBe(true);
    expect(
      exercises
        .filter(({ source }) => source === "curated")
        .every(({ license }) => license === null),
    ).toBe(true);
  });

  it("menyimpan alat gym sebagai string kosong", () => {
    expect(
      exercises
        .filter(({ mode }) => mode === "g")
        .every(({ equipment }) => equipment === ""),
    ).toBe(true);
  });

  it("membatasi gender dan alat untuk katalog rumah, tetapi mengabaikan alat di gym", () => {
    const baseProfile = {
      mode: "c" as const,
      equipment: [],
    };
    const forMen = eligibleExercises(
      { ...baseProfile, gender: "m" },
      catalog,
    );
    const forWomen = eligibleExercises(
      { ...baseProfile, gender: "f" },
      catalog,
    );

    expect(forMen.every(({ gender, equipment }) =>
      (gender === "b" || gender === "m") && equipment === "none",
    )).toBe(true);
    expect(forWomen.every(({ gender, equipment }) =>
      (gender === "b" || gender === "f") && equipment === "none",
    )).toBe(true);

    const gymForWomen = eligibleExercises(
      { mode: "g", gender: "f", equipment: [] },
      catalog,
    );
    expect(gymForWomen.length).toBeGreaterThan(0);
    expect(gymForWomen.every(({ gender }) => gender === "b" || gender === "f")).toBe(true);
  });
});
