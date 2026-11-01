"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getPublicSupabaseEnvironment } from "./env";

export function createSupabaseBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    getPublicSupabaseEnvironment();

  return createBrowserClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
