import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY diperlukan untuk feed kalender.",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
