import type {
  DaysPerWeek,
  ExerciseTarget,
  Gender,
  TrainingMode,
} from "@/lib/engine/types";

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          name: string;
          gender: Gender;
          age: number;
          mode: TrainingMode;
          equipment: string[];
          targets: ExerciseTarget[];
          days_per_week: DaysPerWeek;
          slots: string[];
          start_date: string;
          mood: "semangat" | "tenang" | "kesal" | "marah";
          email_reminders: boolean;
          timezone: string;
          ics_token: string;
          created_at: string;
        },
        {
          id: string;
          name: string;
          gender: Gender;
          age: number;
          mode: TrainingMode;
          equipment?: string[];
          targets: ExerciseTarget[];
          days_per_week: DaysPerWeek;
          slots: string[];
          start_date: string;
          mood?: "semangat" | "tenang" | "kesal" | "marah";
          email_reminders?: boolean;
          timezone?: string;
          ics_token?: string;
          created_at?: string;
        }
      >;
      exercises: Table<
        {
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
        },
        {
          id: string;
          name: string;
          name_en: string;
          target: ExerciseTarget;
          mode: TrainingMode;
          equipment?: string;
          gender?: "b" | Gender;
          sets: number;
          reps: string;
          tips: string;
          images?: string[];
          video_id?: string | null;
          source?: string | null;
          license?: string | null;
          needs_review?: boolean;
        }
      >;
      planned_sessions: Table<
        {
          user_id: string;
          plan_date: string;
          slot: number;
          focus: ExerciseTarget;
          exercise_ids: string[];
        },
        {
          user_id: string;
          plan_date: string;
          slot: number;
          focus: ExerciseTarget;
          exercise_ids: string[];
        }
      >;
      session_logs: Table<
        {
          user_id: string;
          plan_date: string;
          slot: number;
          exercise_id: string;
          sets_done: number;
          done_at: string | null;
        },
        {
          user_id: string;
          plan_date: string;
          slot: number;
          exercise_id: string;
          sets_done?: number;
          done_at?: string | null;
        }
      >;
      penalty_payments: Table<
        { user_id: string; plan_date: string; slot: number; paid_at: string },
        {
          user_id: string;
          plan_date: string;
          slot: number;
          paid_at?: string;
        }
      >;
      push_subscriptions: Table<
        { user_id: string; endpoint: string; keys: Json },
        { user_id: string; endpoint: string; keys: Json }
      >;
      push_deliveries: Table<
        {
          user_id: string;
          plan_date: string;
          slot: number;
          channel: "push" | "email";
          sent_at: string;
        },
        {
          user_id: string;
          plan_date: string;
          slot: number;
          channel: "push" | "email";
          sent_at?: string;
        }
      >;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
