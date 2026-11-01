"use client";

import {
  Barbell,
  CalendarBlank,
  Check,
  CheckCircle,
  CaretLeft,
  CaretRight,
  Clock,
  Fire,
  House,
  List,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  Timer,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import catalogData from "../../data/exercises-curated.json";
import { dateKeyInTimezone } from "@/lib/engine/dates";
import { exerciseSchema } from "@/lib/engine/schema";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useTodayKey } from "@/lib/use-today-key";
import type {
  Exercise as CatalogExercise,
  ExerciseTarget,
  ProgramProfile,
} from "@/lib/engine/types";

type Mood = "semangat" | "tenang" | "kesal" | "marah";
type Tab = "today" | "calendar" | "library" | "profile";

type Exercise = Pick<
  CatalogExercise,
  | "id"
  | "mode"
  | "gender"
  | "name"
  | "name_en"
  | "target"
  | "sets"
  | "reps"
  | "tips"
  | "equipment"
  | "video_id"
  | "images"
  | "needs_review"
>;

type PlannedSession = {
  plan_date: string;
  slot: number;
  focus: ExerciseTarget;
  exercise_ids: string[];
};

type ProfileData = Pick<
  ProgramProfile,
  | "gender"
  | "age"
  | "mode"
  | "equipment"
  | "targets"
  | "daysPerWeek"
  | "slots"
  | "startDate"
  | "timezone"
> & {
  name: string;
  mood: Mood;
  emailReminders: boolean;
};

const catalog: Exercise[] = exerciseSchema.array().parse(catalogData);

function targetLabel(target: ExerciseTarget): string {
  return target === "glute"
    ? "Bokong"
    : target === "core"
      ? "Core"
      : target.charAt(0).toUpperCase() + target.slice(1);
}

function equipmentLabel(equipment: string): string {
  return (
    {
      none: "Tanpa alat",
      chair: "Kursi",
      bar: "Bar pull-up",
      db: "Dumbbell",
      band: "Karet resistance",
      "": "Alat gym",
    }[equipment] ?? equipment
  );
}

function sessionExercises(session: PlannedSession | undefined): Exercise[] {
  if (!session) return [];
  return session.exercise_ids
    .map((id) => catalog.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => exercise !== undefined);
}

function profileFromResponse(value: Record<string, unknown>): ProfileData {
  return {
    name: String(value.name ?? "Pengguna"),
    gender: value.gender as ProgramProfile["gender"],
    age: Number(value.age),
    mode: value.mode as ProgramProfile["mode"],
    equipment: value.equipment as string[],
    targets: value.targets as ExerciseTarget[],
    daysPerWeek: value.days_per_week as ProgramProfile["daysPerWeek"],
    slots: value.slots as string[],
    startDate: String(value.start_date),
    timezone: String(value.timezone),
    mood: (value.mood as Mood) ?? "semangat",
    emailReminders: value.email_reminders === true,
  };
}

type SessionLog = {
  exercise_id: string;
  sets_done: number;
  done_at: string | null;
};

const moods: { id: Mood; label: string; message: string; bpm: number }[] = [
  { id: "semangat", label: "Semangat", message: "Saatnya bakar energi.", bpm: 128 },
  { id: "tenang", label: "Tenang", message: "Pelan tapi rapi, fokus teknik.", bpm: 100 },
  { id: "kesal", label: "Kesal", message: "Keluarkan lewat tarikan dan dorongan.", bpm: 136 },
  { id: "marah", label: "Marah", message: "Salurkan ke beban, bukan ke orang.", bpm: 150 },
];

const navItems: { id: Tab; label: string; icon: typeof House }[] = [
  { id: "today", label: "Hari ini", icon: House },
  { id: "calendar", label: "Kalender", icon: CalendarBlank },
  { id: "library", label: "Pustaka", icon: List },
  { id: "profile", label: "Profil", icon: Barbell },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [mood, setMood] = useState<Mood>("semangat");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const todayDate = useTodayKey(profile?.timezone ?? "Asia/Jakarta");
  const [completionBySlot, setCompletionBySlot] = useState<Record<number, string[]>>({});
  const [setCountsBySlot, setSetCountsBySlot] = useState<
    Record<number, Record<string, number>>
  >({});
  const [streak, setStreak] = useState(0);
  const [penalties, setPenalties] = useState<{ date: string; slot: number; text: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [workout, setWorkout] = useState(false);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState("Semua");
  const [monthOffset, setMonthOffset] = useState(0);
  const audioContext = useRef<AudioContext | null>(null);
  const tickRef = useRef<number | null>(null);
  const selectedSession =
    sessions.find((session) => session.slot === selectedSlot) ?? sessions[0];
  const exercises = sessionExercises(selectedSession);
  const completed = selectedSession
    ? completionBySlot[selectedSession.slot] ?? []
    : [];
  const setCounts = selectedSession
    ? setCountsBySlot[selectedSession.slot] ?? {}
    : {};

  const currentMood = moods.find((item) => item.id === mood) ?? moods[0];
  const finishedCount = completed.length;
  const progress = exercises.length
    ? Math.round((finishedCount / exercises.length) * 100)
    : 0;
  const libraryExercises = profile
    ? catalog.filter(
        (exercise) =>
          exercise.mode === profile.mode &&
          (exercise.gender === "b" || exercise.gender === profile.gender) &&
          (profile.mode === "g" ||
            exercise.equipment === "none" ||
            profile.equipment.includes(exercise.equipment)),
      )
    : [];
  const filteredExercises =
    libraryFilter === "Semua"
      ? libraryExercises
      : libraryExercises.filter(
          (exercise) => targetLabel(exercise.target) === libraryFilter,
        );

  useEffect(() => {
    if (!todayDate) return;
    let active = true;
    async function loadDashboard() {
      try {
        const profileResponse = await fetch("/api/profile");
        const profilePayload = await profileResponse.json();
        if (!profileResponse.ok) {
          throw new Error(profilePayload.error ?? "Profil gagal dimuat.");
        }
        const nextProfile = profileFromResponse(profilePayload.profile);
        const date = dateKeyInTimezone(new Date(), nextProfile.timezone);
        const planResponse = await fetch(`/api/plan?date=${date}`);
        const planPayload = await planResponse.json();
        if (!planResponse.ok) {
          throw new Error(planPayload.error ?? "Rencana latihan gagal dimuat.");
        }
        const nextSessions = planPayload.sessions as PlannedSession[];
        const [penaltyResponse, calendarResponse, ...logResponses] = await Promise.all([
          fetch("/api/penalties"),
          fetch(`/api/calendar?month=${date.slice(0, 7)}`),
          ...nextSessions.map((session) =>
            fetch(`/api/logs?date=${date}&slot=${session.slot}`),
          ),
        ]);
        const penaltyPayload = await penaltyResponse.json();
        const calendarPayload = await calendarResponse.json();
        if (!penaltyResponse.ok || !calendarResponse.ok) {
          throw new Error(
            penaltyPayload.error ??
              calendarPayload.error ??
              "Ringkasan latihan gagal dimuat.",
          );
        }
        const logsBySlot = await Promise.all(
          logResponses.map(async (response) => {
            const payload = await response.json();
            if (!response.ok) {
              throw new Error(payload.error ?? "Progres latihan gagal dimuat.");
            }
            return payload.logs as SessionLog[];
          }),
        );
        if (!active) return;
        setProfile(nextProfile);
        setMood(nextProfile.mood);
        setSessions(nextSessions);
        setSelectedSlot(nextSessions[0]?.slot ?? 0);
        setStreak(calendarPayload.streak);
        setPenalties(penaltyPayload.penalties);
        setCompletionBySlot(
          Object.fromEntries(
            nextSessions.map((session, index) => [
              session.slot,
              logsBySlot[index]
                .filter((log) => Boolean(log.done_at))
                .map((log) => log.exercise_id),
            ]),
          ),
        );
        setSetCountsBySlot(
          Object.fromEntries(
            nextSessions.map((session, index) => [
              session.slot,
              Object.fromEntries(
                logsBySlot[index].map((log) => [log.exercise_id, log.sets_done]),
              ),
            ]),
          ),
        );
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "Data latihan gagal dimuat.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [todayDate, reloadToken]);

  useEffect(() => {
    document.body.dataset.mood = mood;
    return () => {
      delete document.body.dataset.mood;
    };
  }, [mood]);

  useEffect(() => {
    if (restSeconds === null || restSeconds <= 0) return;
    tickRef.current = window.setTimeout(
      () => setRestSeconds((seconds) => (seconds === null ? null : seconds - 1)),
      1000,
    );
    return () => {
      if (tickRef.current) window.clearTimeout(tickRef.current);
    };
  }, [restSeconds]);

  useEffect(() => {
    if (!workout || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    void navigator.wakeLock
      .request("screen")
      .then((wakeLock) => {
        lock = wakeLock;
      })
      .catch(() => undefined);
    return () => {
      void lock?.release();
    };
  }, [workout]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) {
        audioContext.current?.close();
        audioContext.current = null;
        setIsPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, []);

  const toggleCompleted = async (id: string) => {
    const exercise = exercises.find((item) => item.id === id);
    if (!selectedSession || !exercise) return;
    const done = completed.includes(id);
    try {
      const response = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayDate,
          slot: selectedSession.slot,
          exerciseId: id,
          setsDone: done ? 0 : exercise.sets,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setLoadError(payload.error ?? "Progres latihan gagal disimpan.");
        return;
      }
      setLoadError("");
      setCompletionBySlot((current) => ({
        ...current,
        [selectedSession.slot]: done
          ? (current[selectedSession.slot] ?? []).filter((item) => item !== id)
          : [...(current[selectedSession.slot] ?? []), id],
      }));
      setSetCountsBySlot((current) => ({
        ...current,
        [selectedSession.slot]: {
          ...current[selectedSession.slot],
          [id]: done ? 0 : exercise.sets,
        },
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Progres latihan gagal disimpan.");
    }
  };

  const changeMood = async (nextMood: Mood) => {
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: nextMood }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setLoadError(payload.error ?? "Suasana hati gagal disimpan.");
        return;
      }
      setMood(nextMood);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Suasana hati gagal disimpan.");
    }
  };

  const payPenalty = async (penalty: { date: string; slot: number }) => {
    if (!window.confirm("Sudah menyelesaikan latihan tebusan ini?")) return;
    try {
      const response = await fetch("/api/penalties/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(penalty),
      });
      const payload = await response.json();
      if (!response.ok) {
        setLoadError(payload.error ?? "Denda gagal ditandai lunas.");
        return;
      }
      setPenalties((current) =>
        current.filter(
          (item) => item.date !== penalty.date || item.slot !== penalty.slot,
        ),
      );
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Denda gagal ditandai lunas.");
    }
  };

  const skipExercise = () => {
    if (exerciseIndex + 1 >= exercises.length) {
      setWorkout(false);
      setTab("today");
      return;
    }
    const nextIndex = exerciseIndex + 1;
    const nextExercise = exercises[nextIndex];
    setExerciseIndex(nextIndex);
    setSetNumber(Math.min((setCounts[nextExercise.id] ?? 0) + 1, nextExercise.sets));
    setRestSeconds(null);
  };

  const toggleBeat = async () => {
    if (isPlaying) {
      await audioContext.current?.close();
      audioContext.current = null;
      setIsPlaying(false);
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    audioContext.current = context;
    setIsPlaying(true);
    const beatLength = 60 / currentMood.bpm;
    const scheduleBeat = (startAt: number) => {
      if (context.state === "closed" || document.hidden) return;
      const kick = context.createOscillator();
      const kickGain = context.createGain();
      kick.type = "sine";
      kick.frequency.setValueAtTime(110, startAt);
      kick.frequency.exponentialRampToValueAtTime(38, startAt + 0.12);
      kickGain.gain.setValueAtTime(0.35, startAt);
      kickGain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.14);
      kick.connect(kickGain).connect(context.destination);
      kick.start(startAt);
      kick.stop(startAt + 0.15);

      const hat = context.createOscillator();
      const hatGain = context.createGain();
      hat.type = "square";
      hat.frequency.value = 9000;
      hatGain.gain.setValueAtTime(0.035, startAt + beatLength / 2);
      hatGain.gain.exponentialRampToValueAtTime(0.001, startAt + beatLength / 2 + 0.035);
      hat.connect(hatGain).connect(context.destination);
      hat.start(startAt + beatLength / 2);
      hat.stop(startAt + beatLength / 2 + 0.04);
      window.setTimeout(() => scheduleBeat(startAt + beatLength), beatLength * 1000);
    };
    scheduleBeat(context.currentTime + 0.05);
  };

  const startWorkout = () => {
    if (exercises.length === 0) return;
    const firstUnfinished = exercises.findIndex((exercise) => !completed.includes(exercise.id));
    setExerciseIndex(Math.max(0, firstUnfinished));
    setSetNumber(
      Math.min(
        (setCounts[exercises[Math.max(0, firstUnfinished)].id] ?? 0) + 1,
        exercises[Math.max(0, firstUnfinished)].sets,
      ),
    );
    setRestSeconds(null);
    setWorkout(true);
  };

  const completeSet = async () => {
    const exercise = exercises[exerciseIndex];
    if (!exercise || !selectedSession) return;
    try {
      const response = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayDate,
          slot: selectedSession.slot,
          exerciseId: exercise.id,
          setsDone: setNumber,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setLoadError(payload.error ?? "Set gagal disimpan.");
        return;
      }
      setLoadError("");
      setSetCountsBySlot((current) => ({
        ...current,
        [selectedSession.slot]: {
          ...current[selectedSession.slot],
          [exercise.id]: setNumber,
        },
      }));
      if (setNumber >= exercise.sets) {
        setCompletionBySlot((current) => ({
          ...current,
          [selectedSession.slot]: (current[selectedSession.slot] ?? []).includes(
            exercise.id,
          )
            ? current[selectedSession.slot]
            : [...(current[selectedSession.slot] ?? []), exercise.id],
        }));
        if (exerciseIndex + 1 >= exercises.length) {
          setWorkout(false);
          setTab("today");
          return;
        }
        setExerciseIndex((index) => index + 1);
        const nextExercise = exercises[exerciseIndex + 1];
        setSetNumber(
          Math.min(
            (setCountsBySlot[selectedSession.slot]?.[nextExercise.id] ?? 0) + 1,
            nextExercise.sets,
          ),
        );
      } else {
        setSetNumber((number) => number + 1);
        setRestSeconds(45);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Set gagal disimpan.");
      return;
    }
  };

  const today = useMemo(
    () => {
      if (!todayDate) return "Menyiapkan tanggal...";
      return new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: profile?.timezone ?? "Asia/Jakarta",
      }).format(new Date(`${todayDate}T12:00:00`));
    },
    [profile?.timezone, todayDate],
  );

  if (workout) {
    const exercise = exercises[exerciseIndex];
    if (!exercise) return null;
    return (
      <main className="workout-screen">
        <header className="workout-top">
          <button className="icon-button" onClick={() => setWorkout(false)} aria-label="Keluar dari latihan">
            <X size={24} />
          </button>
          <span>SESI {selectedSession ? selectedSession.slot + 1 : 1} DARI {sessions.length || 1}</span>
          <span className="workout-progress">{exerciseIndex + 1}/{exercises.length}</span>
        </header>
        <div className="workout-content">
          <div className="exercise-demo">
            <div className="demo-orbit orbit-one" />
            <div className="demo-orbit orbit-two" />
            <div className="demo-icon"><Barbell size={56} weight="light" /></div>
            <span className="demo-caption">DEMO GERAKAN</span>
          </div>
          {exercise.video_id ? (
            <a
              className="video-search-link"
              href={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(exercise.video_id)}`}
              target="_blank"
              rel="noreferrer"
            >
              Buka video tutorial
            </a>
          ) : (
            <a
              className="video-search-link"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name_en} proper form tutorial`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Cari tutorial gerakan
            </a>
          )}
          <p className="eyebrow">{targetLabel(exercise.target)} · {exercise.reps}</p>
          <h1>{exercise.name}</h1>
          <p className="muted">{exercise.tips}</p>
          <div className="set-counter">
            <span className="set-number">{String(setNumber).padStart(2, "0")}</span>
            <span className="set-divider">/</span>
            <span className="set-total">{String(exercise.sets).padStart(2, "0")}</span>
            <span className="set-caption">SET</span>
          </div>
          {restSeconds !== null && restSeconds > 0 ? (
            <div className="rest-card">
              <Timer size={22} />
              <span>Istirahat {restSeconds} detik</span>
              <button className="text-button" onClick={() => setRestSeconds(null)}>Lewati</button>
            </div>
          ) : null}
          <button className="primary-button complete-set-button" onClick={completeSet}>
            <Check size={23} weight="bold" />
            {setNumber === exercise.sets ? "Selesaikan gerakan" : "Set selesai"}
          </button>
          {loadError ? <p className="form-message" role="alert">{loadError}</p> : null}
          <button className="text-button workout-skip" onClick={skipExercise}>Lewati gerakan</button>
        </div>
        <footer className="workout-footer">Layar tetap menyala saat kamu berlatih</footer>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setTab("today")}>
          <span className="brand-mark"><Barbell size={20} weight="bold" /></span>
          <span>BANGUN<span className="brand-light">BADAN</span></span>
        </a>
        <div className="sidebar-label">MENU UTAMA</div>
        <nav className="side-nav" aria-label="Navigasi utama">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
              <Icon size={20} weight={tab === id ? "fill" : "regular"} />
              <span>{label}</span>
              {tab === id ? <span className="nav-active-dot" /> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-program">
          <span className="program-icon"><Fire size={19} weight="fill" /></span>
          <span className="program-label">PROGRAM KAMU</span>
          <strong>{profile?.mode === "g" ? <>Strength<br />training</> : <>Bodyweight<br />strength</>}</strong>
          <span className="program-meta">{profile?.daysPerWeek ?? "—"} hari · {profile?.mode === "g" ? "Gym" : "Kalistenik"}</span>
          <div className="program-progress"><span style={{ width: `${progress}%` }} /></div>
          <span className="program-week">Dimulai {profile?.startDate ?? "—"}</span>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{profile?.name.slice(0, 1).toUpperCase() ?? "?"}</div>
          <div><strong>{profile?.name ?? "Memuat profil..."}</strong><span>Program personal</span></div>
          <button className="more-button" aria-label="Menu profil">···</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Barbell size={18} weight="bold" /></span> BANGUN BADAN</div>
          <div className="breadcrumb"><span>Program</span><CaretRight size={14} /><strong>{navItems.find((item) => item.id === tab)?.label}</strong></div>
          <div className="topbar-actions">
            <button className={`music-button ${isPlaying ? "music-on" : ""}`} onClick={toggleBeat} aria-pressed={isPlaying}>
              {isPlaying ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}
              <span>{isPlaying ? `Beat ${currentMood.bpm} BPM` : "Putar beat"}</span>
            </button>
            <div className="top-streak"><Fire size={19} weight="fill" /><strong>{streak}</strong><span>hari</span></div>
            <div className="top-avatar">{profile?.name.slice(0, 1).toUpperCase() ?? "?"}</div>
          </div>
        </header>

        <div className="page-content">
          {loadError ? <p className="form-message" role="alert">{loadError}</p> : null}
          {tab === "today" ? (
            <>
              <section className="day-intro">
                <div className="intro-copy">
                  <p className="eyebrow">{today} <span className="eyebrow-dot" /> {profile?.daysPerWeek ?? 0} HARI PER MINGGU</p>
                  <h1>{sessions.length === 0 ? <>Hari <span>istirahat.</span></> : <>Fokus <span>{targetLabel(selectedSession?.focus ?? "core")}.</span></>}</h1>
                  <p className="intro-subtitle">{sessions.length === 0 ? "Pulihkan tenaga; hari istirahat tidak memutus ritmemu." : "Satu langkah kecil hari ini, lebih kuat untuk besok."}</p>
                </div>
                <div className="date-stamp"><span>SESI</span><strong>{String(sessions.length).padStart(2, "0")}</strong><span>HARI INI</span></div>
              </section>

              {isLoading ? <p className="intro-subtitle" role="status">Memuat program dan progres latihan...</p> : null}

              <section className="mood-row" aria-label="Pilih suasana hati">
                <div className="mood-message"><span className="mood-pulse" /><span>{currentMood.message}</span></div>
                <div className="mood-options">
                  {moods.map((item) => (
                    <button key={item.id} className={`mood-option ${mood === item.id ? "selected" : ""}`} onClick={() => void changeMood(item.id)} aria-pressed={mood === item.id}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>

              <div className="dashboard-grid">
                <section className="session-column">
                  <div className="section-heading">
                    <div><span className="section-kicker">{selectedSession ? `SESI ${selectedSession.slot + 1}` : "JADWAL HARI INI"}</span><h2>{selectedSession ? `Fokus ${targetLabel(selectedSession.focus)}` : "Hari istirahat"}</h2></div>
                    {selectedSession ? <div className="session-time"><Clock size={16} /><span>{profile?.slots[selectedSession.slot]}</span><span className="time-divider">·</span><span>± 45 menit</span></div> : null}
                  </div>

                  {sessions.length > 1 ? (
                    <div className="session-picker" aria-label="Pilih sesi">
                      {sessions.map((session) => (
                        <button
                          key={session.slot}
                          className={selectedSlot === session.slot ? "active" : ""}
                          onClick={() => setSelectedSlot(session.slot)}
                          aria-pressed={selectedSlot === session.slot}
                        >
                          Sesi {session.slot + 1} · {profile?.slots[session.slot]}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="progress-strip">
                    <div className="progress-label"><span>PROGRES SESI</span><strong>{finishedCount}<i> / {exercises.length} gerakan</i></strong></div>
                    <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                    <span className="progress-percent">{progress}%</span>
                  </div>

                  <div className="exercise-list">
                    {exercises.map((exercise, index) => {
                      const done = completed.includes(exercise.id);
                      return (
                        <article key={exercise.id} className={`exercise-row ${done ? "exercise-done" : ""}`}>
                          <button className={`exercise-check ${done ? "checked" : ""}`} onClick={() => toggleCompleted(exercise.id)} aria-label={done ? `Tandai ${exercise.name} belum selesai` : `Tandai ${exercise.name} selesai`}>
                            {done ? <Check size={16} weight="bold" /> : <span>{String(index + 1).padStart(2, "0")}</span>}
                          </button>
                          <div className="exercise-details">
                            <strong>{exercise.name}</strong>
                            <span>{setCounts[exercise.id] ?? 0}/{exercise.sets} set <i>×</i> {exercise.reps} <b>·</b> {equipmentLabel(exercise.equipment)}</span>
                          </div>
                          <span className={`exercise-target target-${exercise.target === "glute" ? "bokong" : exercise.target}`}>{targetLabel(exercise.target)}</span>
                          <a className="exercise-menu" aria-label={`Cari tutorial ${exercise.name}`} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name_en} proper form tutorial`)}`} target="_blank" rel="noreferrer">▶</a>
                        </article>
                      );
                    })}
                  </div>
                  <button className="primary-button start-button" onClick={startWorkout} disabled={exercises.length === 0 || finishedCount === exercises.length || isLoading}>
                    <Play size={19} weight="fill" /> Mulai latihan <CaretRight size={19} />
                  </button>
                  <p className="start-hint"><CheckCircle size={14} /> Progres set tersimpan untuk sesi ini</p>
                </section>

                <aside className="insight-column">
                  <div className="streak-card">
                    <div className="streak-top"><div><span className="section-kicker">KONSISTENSI</span><h3>Ritme kamu</h3></div><Fire className="fire-icon" size={27} weight="fill" /></div>
                    <div className="streak-count"><strong>{String(streak).padStart(2, "0")}</strong><span>hari<br />beruntun</span></div>
                    <p className="streak-note">Hari ini kesempatanmu menjaga ritme.</p>
                    <p className="streak-note">Hari ini kesempatanmu menjaga ritme.</p>
                  </div>

                  <div className="penalty-card">
                    <div className="penalty-heading"><span className="penalty-symbol">!</span><div><span className="section-kicker">TANGGUNG JAWAB</span><h3>Denda tertunda</h3></div><span className="penalty-count">{String(penalties.length).padStart(2, "0")}</span></div>
                    <p className="penalty-copy">Sesi yang terlewat punya tebusan. Selesaikan untuk kembali ke jalur.</p>
                    {penalties.map((penalty) => (
                      <div className="penalty-item" key={`${penalty.date}:${penalty.slot}`}>
                        <span className="penalty-dot" />
                        <span>{penalty.text}</span>
                        <button onClick={() => void payPenalty(penalty)}>Tandai tebusan selesai</button>
                      </div>
                    ))}
                    {penalties.length === 0 ? <p className="penalty-copy">Tidak ada denda tertunda.</p> : null}
                    <button className="penalty-action" onClick={() => setTab("calendar")}>Lihat semua <CaretRight size={15} /></button>
                  </div>

                  <div className="quote-card">
                    <span className="quote-mark">“</span>
                    <p>Kuat itu bukan soal tak pernah berhenti. Tapi soal selalu memilih untuk mulai lagi.</p>
                    <span className="quote-attribution">CATATAN HARI INI</span>
                  </div>
                </aside>
              </div>
              <footer className="health-note">Dengarkan tubuhmu. Hentikan latihan jika terasa sakit atau tidak nyaman.</footer>
            </>
          ) : tab === "library" ? (
            <section className="secondary-page">
              <p className="eyebrow">GERAKAN PILIHAN</p><h1>Pustaka <span>latihan.</span></h1>
              <p className="intro-subtitle">Gerakan yang sesuai programmu, dengan tips singkat untuk teknik yang lebih rapi.</p>
              <div className="filter-row">
                {["Semua", "Dada", "Punggung", "Bahu", "Lengan", "Core", "Bokong", "Kaki"].map((filter) => <button key={filter} className={`filter-chip ${libraryFilter === filter ? "active" : ""}`} onClick={() => setLibraryFilter(filter)}>{filter}</button>)}
              </div>
              {catalog.some((exercise) => exercise.needs_review && libraryExercises.includes(exercise)) ? <p className="health-note">Sebagian gerakan gym perempuan perlu ditinjau pelatih bersertifikat. Ini bukan rekomendasi medis.</p> : null}
              <div className="library-grid">{filteredExercises.map((exercise, index) => <article className="library-card" key={exercise.id}><div className="library-art"><span>{String(index + 1).padStart(2, "0")}</span><Barbell size={30} weight="light" /></div><div className="library-card-body"><span className={`exercise-target target-${exercise.target === "glute" ? "bokong" : exercise.target}`}>{targetLabel(exercise.target)}</span><h3>{exercise.name}</h3><p>{exercise.tips}</p><div className="library-meta"><span>{equipmentLabel(exercise.equipment)}</span><span>{exercise.sets} × {exercise.reps}</span></div>{exercise.needs_review ? <small>Perlu ditinjau</small> : null}<a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name_en} proper form tutorial`)}`} target="_blank" rel="noreferrer">Tonton cara melakukan</a></div></article>)}</div>
            </section>
          ) : tab === "calendar" ? (
            <CalendarPage monthOffset={monthOffset} setMonthOffset={setMonthOffset} timezone={profile?.timezone ?? "Asia/Jakarta"} />
          ) : (
            profile ? (
              <ProfilePage
                profile={profile}
                moodLabel={currentMood.label}
                onProfileUpdated={(nextProfile) => {
                  setProfile(nextProfile);
                  setReloadToken((token) => token + 1);
                }}
                onError={setLoadError}
              />
            ) : (
              <section className="secondary-page profile-page">
                <p className="form-message" role="alert">Profil belum tersedia. Muat ulang halaman atau masuk kembali.</p>
              </section>
            )
          )}
        </div>
        <nav className="mobile-nav" aria-label="Navigasi bawah">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={21} weight={tab === id ? "fill" : "regular"} /><span>{label}</span></button>)}
        </nav>
      </main>
    </div>
  );
}

function CalendarPage({
  monthOffset,
  setMonthOffset,
  timezone,
}: {
  monthOffset: number;
  setMonthOffset: (offset: number) => void;
  timezone: string;
}) {
  const [calendar, setCalendar] = useState<{
    statuses: { date: string; status: string; completedSessions: number; totalSessions: number }[];
    streak: number;
    icsUrl: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loadedMonth, setLoadedMonth] = useState("");
  const todayKey = useTodayKey(timezone);
  const [currentYear, currentMonth] = (todayKey || "1970-01-01").split("-").map(Number);
  const shownDate = new Date(currentYear, currentMonth - 1 + monthOffset, 1);
  const monthKey = todayKey
    ? `${shownDate.getFullYear()}-${String(shownDate.getMonth() + 1).padStart(2, "0")}`
    : "";
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(shownDate);
  const firstDay = new Date(shownDate.getFullYear(), shownDate.getMonth(), 1).getDay();
  const dayCount = new Date(shownDate.getFullYear(), shownDate.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: dayCount }, (_, index) => index + 1)];

  useEffect(() => {
    if (!monthKey) return;
    let active = true;
    fetch(`/api/calendar?month=${monthKey}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Kalender gagal dimuat.");
        return payload;
      })
      .then((payload) => {
        if (active) {
          setCalendar(payload);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Kalender gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoadedMonth(monthKey);
      });
    return () => {
      active = false;
    };
  }, [monthKey]);

  const statusByDate = new Map(calendar?.statuses.map((status) => [status.date, status]) ?? []);
  const completedSessions = calendar?.statuses.reduce(
    (total, day) => total + day.completedSessions,
    0,
  ) ?? 0;
  const totalSessions = calendar?.statuses.reduce((total, day) => total + day.totalSessions, 0) ?? 0;
  return (
    <section className="secondary-page calendar-page">
      <p className="eyebrow">JEJAK KONSISTENSI</p><h1>Ritmemu <span>tercatat.</span></h1>
      <p className="intro-subtitle">Satu hari, satu langkah. Lihat perjalananmu bulan ini.</p>
      {error ? <p className="form-message" role="alert">{error}</p> : null}
      {!todayKey || loadedMonth !== monthKey ? <p className="intro-subtitle" role="status">Memuat riwayat kalender...</p> : null}
      <div className="calendar-layout">
        <div className="calendar-card">
          <div className="calendar-heading"><div><span className="section-kicker">KALENDER LATIHAN</span><h2>{monthName}</h2></div><div className="calendar-controls"><button onClick={() => setMonthOffset(monthOffset - 1)} aria-label="Bulan sebelumnya"><CaretLeft size={18} /></button><button onClick={() => setMonthOffset(monthOffset + 1)} aria-label="Bulan berikutnya"><CaretRight size={18} /></button></div></div>
          <div className="calendar-grid">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}{cells.map((day, index) => {
            if (!day) return <div key={`d-${index}`} className="calendar-day calendar-empty" />;
            const date = `${monthKey}-${String(day).padStart(2, "0")}`;
            const status = statusByDate.get(date);
            return <div key={`d-${index}`} className={`calendar-day calendar-${status?.status ?? "unknown"} ${date === todayKey ? "calendar-today" : ""}`} title={status ? `${status.completedSessions}/${status.totalSessions} sesi selesai · ${status.status}` : undefined}><span>{day}</span>{status?.status === "complete" ? <i><Check size={10} weight="bold" /></i> : null}</div>;
          })}</div>
          <div className="calendar-legend"><span><i className="legend-dot done" />Sesi selesai</span><span><i className="legend-dot rest" />Hari istirahat</span><span><i className="legend-dot missed" />Terlewat</span><span><i className="legend-dot partial" />Sebagian</span></div>
        </div>
        <aside className="calendar-summary"><div className="summary-icon"><Fire size={23} weight="fill" /></div><span className="section-kicker">BULAN INI</span><strong>{completedSessions}<small> / {totalSessions}</small></strong><span className="summary-caption">sesi latihan selesai</span><div className="summary-divider" /><span className="section-kicker">STREAK SAAT INI</span><strong>{String(calendar?.streak ?? 0).padStart(2, "0")} <small>hari</small></strong><p>{calendar?.icsUrl ? <a href={calendar.icsUrl}>Berlangganan kalender (.ics)</a> : "Sinkronisasi kalender belum tersedia."}</p></aside>
      </div>
    </section>
  );
}

function ProfilePage({
  profile,
  moodLabel,
  onProfileUpdated,
  onError,
}: {
  profile: ProfileData;
  moodLabel: string;
  onProfileUpdated: (profile: ProfileData) => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(profile?.name ?? "");
  const [age, setAge] = useState(String(profile?.age ?? ""));
  const [gender, setGender] = useState(profile?.gender ?? "m");
  const [mode, setMode] = useState(profile?.mode ?? "c");
  const [equipment, setEquipment] = useState(profile?.equipment ?? []);
  const [targets, setTargets] = useState(profile?.targets ?? []);
  const [daysPerWeek, setDaysPerWeek] = useState(profile?.daysPerWeek ?? 3);
  const [slots, setSlots] = useState(profile?.slots ?? ["07:00"]);
  const [timezone, setTimezone] = useState(profile?.timezone ?? "Asia/Jakarta");
  const [emailReminders, setEmailReminders] = useState(profile.emailReminders);
  const [busy, setBusy] = useState(false);

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          age: Number(age),
          gender,
          mode,
          equipment,
          targets,
          days_per_week: daysPerWeek,
          slots,
          timezone,
          email_reminders: emailReminders,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Profil gagal disimpan.");
      onProfileUpdated(profileFromResponse(payload.profile));
      onError("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Profil gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const restartProgram = async () => {
    if (!window.confirm("Mulai ulang program dari hari ini? Riwayat lama tetap disimpan.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Program gagal dimulai ulang.");
      onProfileUpdated(profileFromResponse(payload.profile));
      onError("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Program gagal dimulai ulang.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      router.replace("/masuk");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Gagal keluar dari akun.");
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm("Hapus akun dan seluruh data latihan secara permanen? Tindakan ini tidak dapat dibatalkan.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/profile", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Akun gagal dihapus.");
      router.replace("/masuk");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Akun gagal dihapus.");
      setBusy(false);
    }
  };

  const toggleValue = <T extends string>(
    current: T[],
    value: T,
    update: (next: T[]) => void,
  ) => update(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);

  return (
    <section className="secondary-page profile-page">
      <p className="eyebrow">PENGATURAN</p><h1>Profil <span>program.</span></h1>
      <p className="intro-subtitle">Perbarui preferensi latihan dan jadwalmu.</p>
      <div className="profile-summary"><div className="profile-large-avatar">{profile.name.slice(0, 1).toUpperCase()}</div><div><h2>{profile.name}</h2><p>{profile.mode === "c" ? "Kalistenik" : "Gym"} · {profile.daysPerWeek} hari per minggu</p></div></div>
      <PushNotificationSettings onError={onError} />
      <form className="profile-form" onSubmit={(event) => void submitProfile(event)}>
        <label>Nama<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Usia<input required type="number" min={1} max={120} value={age} onChange={(event) => setAge(event.target.value)} /></label>
        <label>Gender<select value={gender} onChange={(event) => setGender(event.target.value as ProfileData["gender"])}><option value="m">Laki-laki</option><option value="f">Perempuan</option></select></label>
        <label>Mode latihan<select value={mode} onChange={(event) => {
          const nextMode = event.target.value as ProfileData["mode"];
          setMode(nextMode);
          if (nextMode === "g") setEquipment([]);
        }}><option value="c">Kalistenik di rumah</option><option value="g">Gym</option></select></label>
        <fieldset><legend>Alat yang tersedia</legend>{(["chair", "bar", "db", "band"] as const).map((item) => <label className="profile-checkbox" key={item}><input type="checkbox" checked={equipment.includes(item)} onChange={() => toggleValue(equipment, item, setEquipment)} />{equipmentLabel(item)}</label>)}</fieldset>
        <fieldset><legend>Target latihan</legend>{(["dada", "punggung", "bahu", "lengan", "kaki", "glute", "core"] as ExerciseTarget[]).map((item) => <label className="profile-checkbox" key={item}><input type="checkbox" checked={targets.includes(item)} onChange={() => toggleValue(targets, item, setTargets)} />{targetLabel(item)}</label>)}</fieldset>
        <label>Hari latihan per minggu<select value={daysPerWeek} onChange={(event) => setDaysPerWeek(Number(event.target.value) as ProfileData["daysPerWeek"])}>{[2, 3, 4, 5, 6, 7].map((days) => <option value={days} key={days}>{days} hari</option>)}</select></label>
        <fieldset className="profile-slots">
          <legend>Jam sesi latihan</legend>
          {slots.map((time, index) => (
            <label key={`slot-${index}`}>Sesi {index + 1}
              <span>
                <input type="time" required value={time} onChange={(event) => setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? event.target.value : slot))} />
                {slots.length > 1 ? <button className="text-button" type="button" onClick={() => setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index))} aria-label={`Hapus sesi ${index + 1}`}>Hapus</button> : null}
              </span>
            </label>
          ))}
          {slots.length < 3 ? <button className="text-button" type="button" onClick={() => setSlots((current) => [...current, ["07:00", "12:00", "18:00", "20:00"].find((candidate) => !current.includes(candidate)) ?? "20:00"])}>Tambah sesi</button> : null}
        </fieldset>
        <label>Zona waktu<input required value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Jakarta" /></label>
        <label className="profile-email-optin"><input type="checkbox" checked={emailReminders} onChange={(event) => setEmailReminders(event.target.checked)} /> Kirim pengingat latihan ke email akun</label>
        <div className="profile-form-actions"><button className="primary-button" disabled={busy || targets.length === 0}>{busy ? "Menyimpan..." : "Simpan profil"}</button><span>Suasana hati hari ini: {moodLabel}</span></div>
      </form>
      <div className="profile-danger-zone"><button className="text-button" disabled={busy} onClick={() => void restartProgram()}>Mulai ulang program</button><button className="text-button" disabled={busy} onClick={() => void signOut()}>Keluar</button><button className="text-button danger-button" disabled={busy} onClick={() => void deleteAccount()}>Hapus akun</button></div>
    </section>
  );
}

function decodeApplicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value.replace(/-/g, "+").replace(/_/g, "/")}${padding}`;
  const decoded = window.atob(base64);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function PushNotificationSettings({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Pengingat push tidak aktif di perangkat ini.");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (subscription) {
          setEnabled(true);
          setStatus("Pengingat latihan aktif pada perangkat ini.");
        }
      })
      .catch(() => undefined);
  }, []);

  const enablePush = async () => {
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Perangkat atau browser ini belum mendukung notifikasi push.");
      }
      const keyResponse = await fetch("/api/push-subscriptions");
      const keyPayload = await keyResponse.json();
      if (!keyResponse.ok) throw new Error(keyPayload.error ?? "Konfigurasi push tidak tersedia.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Izin notifikasi belum diberikan.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(keyPayload.publicKey),
        }));
      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Langganan push gagal disimpan.");
      setEnabled(true);
      setStatus("Pengingat latihan aktif pada perangkat ini.");
      onError("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Notifikasi push gagal diaktifkan.");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setEnabled(false);
        setStatus("Pengingat push tidak aktif di perangkat ini.");
        return;
      }
      const response = await fetch("/api/push-subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Langganan push gagal dihapus.");
      await subscription.unsubscribe();
      setEnabled(false);
      setStatus("Pengingat push dimatikan pada perangkat ini.");
      onError("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Notifikasi push gagal dimatikan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="push-settings">
      <div>
        <strong>Pengingat latihan</strong>
        <span>{status} Notifikasi dikirim sekitar 5–15 menit sebelum sesi.</span>
      </div>
      {enabled ? (
        <button className="text-button" disabled={busy} onClick={() => void disablePush()}>
          {busy ? "Memproses..." : "Matikan"}
        </button>
      ) : (
        <button className="text-button" disabled={busy} onClick={() => void enablePush()}>
          {busy ? "Memproses..." : "Aktifkan"}
        </button>
      )}
    </div>
  );
}
