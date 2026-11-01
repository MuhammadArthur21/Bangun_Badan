"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import catalogData from "../../../data/exercises-curated.json";
import { createPlanForDate } from "@/lib/engine/plan";
import { exerciseSchema, profileSetupSchema } from "@/lib/engine/schema";
import type {
  Exercise,
  ExerciseTarget,
  Gender,
  TrainingMode,
} from "@/lib/engine/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useTodayKey } from "@/lib/use-today-key";

const catalog: Exercise[] = exerciseSchema.array().parse(catalogData);

const targets: { id: ExerciseTarget; label: string; example: string }[] = [
  { id: "dada", label: "Dada", example: "Push-up standar atau incline press." },
  { id: "punggung", label: "Punggung dan sayap", example: "Australian row atau lat pulldown." },
  { id: "bahu", label: "Bahu", example: "Pike push-up atau shoulder press." },
  { id: "lengan", label: "Lengan", example: "Chin-up atau curl dumbbell." },
  { id: "kaki", label: "Kaki", example: "Squat atau leg press." },
  { id: "glute", label: "Bokong", example: "Glute bridge atau hip thrust." },
  { id: "core", label: "Perut dan core", example: "Plank atau dead bug." },
];

const equipmentOptions = [
  { id: "chair", label: "Kursi kokoh" },
  { id: "bar", label: "Bar pull-up" },
  { id: "db", label: "Dumbbell" },
  { id: "band", label: "Karet resistance" },
] as const;

type WizardValues = {
  gender: Gender;
  age: string;
  mode: TrainingMode;
  equipment: string[];
  targets: ExerciseTarget[];
  daysPerWeek: number;
  slots: string[];
};

const initialValues: WizardValues = {
  gender: "m",
  age: "",
  mode: "c",
  equipment: [],
  targets: [],
  daysPerWeek: 3,
  slots: ["07:00"],
};

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initialValues);
  const timezone = "Asia/Jakarta";
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const today = useTodayKey(timezone);
  const preview = useMemo(() => {
    if (!values.age || values.targets.length === 0) return [];
    const plan = profileSetupSchema.safeParse({
      name: "Pratinjau",
      gender: values.gender,
      age: Number(values.age),
      mode: values.mode,
      equipment: values.mode === "c" ? values.equipment : [],
      targets: values.targets,
      daysPerWeek: values.daysPerWeek,
      slots: values.slots,
      timezone,
    });
    if (!plan.success) return [];
    return createPlanForDate(
      {
        ...plan.data,
        startDate: today,
      },
      catalog,
      today,
    );
  }, [today, values]);

  function update(patch: Partial<WizardValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setError("");
  }

  function validateStep(): boolean {
    const data = [
      { gender: values.gender, age: Number(values.age) },
      { mode: values.mode },
      { equipment: values.mode === "c" ? values.equipment : [] },
      { targets: values.targets },
      { daysPerWeek: values.daysPerWeek, slots: values.slots },
    ][step];
    const schemas = [
      profileSetupSchema.pick({ gender: true, age: true }),
      profileSetupSchema.pick({ mode: true }),
      profileSetupSchema.pick({ equipment: true }),
      profileSetupSchema.pick({ targets: true }),
      profileSetupSchema.pick({ daysPerWeek: true, slots: true }),
    ];
    const result = schemas[step].safeParse(data);
    if (result.success) return true;
    setError(result.error.issues[0]?.message ?? "Periksa jawabanmu.");
    return false;
  }

  function next() {
    if (!validateStep()) return;
    setStep((current) => Math.min(current + 1, 4));
  }

  function toggleTarget(target: ExerciseTarget) {
    update({
      targets: values.targets.includes(target)
        ? values.targets.filter((item) => item !== target)
        : [...values.targets, target],
    });
  }

  function toggleEquipment(item: string) {
    update({
      equipment: values.equipment.includes(item)
        ? values.equipment.filter((equipment) => equipment !== item)
        : [...values.equipment, item],
    });
  }

  function updateSlotCount(count: number) {
    update({
      slots: Array.from(
        { length: count },
        (_, index) => values.slots[index] ?? ["07:00", "12:00", "18:00"][index],
      ),
    });
  }

  async function finish() {
    if (!validateStep()) return;
    const setup = profileSetupSchema.safeParse({
      name: "Pengguna",
      gender: values.gender,
      age: Number(values.age),
      mode: values.mode,
      equipment: values.mode === "c" ? values.equipment : [],
      targets: values.targets,
      daysPerWeek: values.daysPerWeek,
      slots: values.slots,
      timezone,
    });
    if (!setup.success) {
      setError(setup.error.issues[0]?.message ?? "Periksa kembali programmu.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        setError("Sesi akun berakhir. Masuk kembali untuk menyimpan program.");
        return;
      }

      const name =
        user.user_metadata.full_name ??
        user.email?.split("@")[0] ??
        "Pengguna";
      const { error: saveError } = await supabase.from("profiles").insert({
        id: user.id,
        name,
        gender: setup.data.gender,
        age: setup.data.age,
        mode: setup.data.mode,
        equipment: setup.data.equipment,
        targets: setup.data.targets,
        days_per_week: setup.data.daysPerWeek,
        slots: setup.data.slots,
        start_date: today,
        timezone: setup.data.timezone,
      });
      if (saveError) {
        setError("Program tidak tersimpan. Periksa koneksi dan coba lagi.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Terjadi kesalahan saat menyimpan program.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="wizard-shell">
      <section className="wizard-card">
        <p className="eyebrow">PROGRAM LATIHAN · LANGKAH {step + 1} DARI 5</p>
        <div className="wizard-progress" aria-label={`Langkah ${step + 1} dari 5`}>
          <span style={{ width: `${((step + 1) / 5) * 100}%` }} />
        </div>
        {step === 0 ? (
          <div className="wizard-step">
            <h1>Mulai dari<br /><span>profilmu.</span></h1>
            <p>Umur tidak mengubah program atau denda. Kami hanya menanyakan untuk konteks profil.</p>
            <fieldset>
              <legend>Gender</legend>
              {(["m", "f"] as const).map((gender) => (
                <button
                  type="button"
                  key={gender}
                  className={`choice-button ${values.gender === gender ? "selected" : ""}`}
                  aria-pressed={values.gender === gender}
                  onClick={() => update({ gender })}
                >
                  {gender === "m" ? "Laki-laki" : "Perempuan"}
                </button>
              ))}
            </fieldset>
            <label>Umur<input type="number" min="1" max="120" value={values.age} onChange={(event) => update({ age: event.target.value })} /></label>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="wizard-step">
            <h1>Pilih tempat<br /><span>latihanmu.</span></h1>
            <div className="choice-list">
              <button type="button" className={`choice-button ${values.mode === "c" ? "selected" : ""}`} onClick={() => update({ mode: "c" })}>Kalistenik di rumah</button>
              <button type="button" className={`choice-button ${values.mode === "g" ? "selected" : ""}`} onClick={() => update({ mode: "g", equipment: [] })}>Gym</button>
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="wizard-step">
            <h1>Alat yang<br /><span>kamu punya.</span></h1>
            <p>Boleh pilih beberapa atau lanjut tanpa alat.</p>
            <div className="choice-list">
              {equipmentOptions.map(({ id, label }) => (
                <button
                  type="button"
                  key={id}
                  className={`choice-button ${values.equipment.includes(id) ? "selected" : ""}`}
                  aria-pressed={values.equipment.includes(id)}
                  onClick={() => toggleEquipment(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="wizard-step">
            <h1>Bagian yang ingin<br /><span>dibentuk.</span></h1>
            <p>Pilih minimal satu target. Contoh gerakan memperlihatkan dampaknya pada program.</p>
            <div className="target-choices">
              {targets.map((target) => (
                <button
                  type="button"
                  key={target.id}
                  className={`choice-button ${values.targets.includes(target.id) ? "selected" : ""}`}
                  aria-pressed={values.targets.includes(target.id)}
                  onClick={() => toggleTarget(target.id)}
                >
                  <strong>{target.label}</strong><small>{target.example}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="wizard-step">
            <h1>Atur ritme<br /><span>mingguanmu.</span></h1>
            <label>
              Jumlah sesi per hari
              <select value={values.slots.length} onChange={(event) => updateSlotCount(Number(event.target.value))}>
                {[1, 2, 3].map((count) => <option key={count} value={count}>{count} sesi</option>)}
              </select>
            </label>
            <div className="slot-inputs">
              {values.slots.map((slot, index) => (
                <label key={index}>Jam sesi {index + 1}<input type="time" value={slot} onChange={(event) => update({ slots: values.slots.map((value, slotIndex) => slotIndex === index ? event.target.value : value) })} /></label>
              ))}
            </div>
            <label>
              Hari latihan per minggu
              <select value={values.daysPerWeek} onChange={(event) => update({ daysPerWeek: Number(event.target.value) })}>
                {[2, 3, 4, 5, 6, 7].map((count) => <option key={count} value={count}>{count} hari</option>)}
              </select>
            </label>
            <div className="preview-panel">
              <strong>Pratinjau untuk {today}</strong>
              {preview.length === 0
                ? <p>Hari ini hari istirahat menurut pola yang dipilih.</p>
                : preview.map((session) => (
                    <p key={session.slot}>
                      Sesi {session.slot + 1} · fokus {session.focus}: {session.exerciseIds
                        .map((id) => catalog.find((exercise) => exercise.id === id)?.name)
                        .filter(Boolean)
                        .join(", ") || "belum ada gerakan yang cocok"}
                    </p>
                  ))}
            </div>
          </div>
        ) : null}
        {error ? <p className="form-message" role="alert">{error}</p> : null}
        <div className="wizard-actions">
          {step > 0 ? <button className="secondary-button" type="button" onClick={() => { setError(""); setStep((current) => current - 1); }}>Kembali</button> : <span />}
          {step < 4
            ? <button className="primary-button" type="button" onClick={next}>Lanjut</button>
            : <button className="primary-button" type="button" onClick={finish} disabled={saving}>{saving ? "Menyimpan..." : "Simpan program"}</button>}
        </div>
      </section>
    </main>
  );
}
