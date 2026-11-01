import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";

const publicPaths = new Set(["/masuk", "/daftar"]);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  let response = NextResponse.next({ request });
  let environment: ReturnType<typeof getPublicSupabaseEnvironment>;
  try {
    environment = getPublicSupabaseEnvironment();
  } catch {
    if (publicPaths.has(path)) return response;
    return NextResponse.json(
      { error: "Autentikasi belum dikonfigurasi untuk lingkungan ini." },
      { status: 503 },
    );
  }
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = environment;
  const supabase = createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  // Pengunjung tanpa sesi bukan kesalahan; arahkan ke halaman masuk.
  if (authError && authError.name !== "AuthSessionMissingError") {
    if (publicPaths.has(path)) return response;
    return NextResponse.json(
      { error: "Sesi autentikasi tidak dapat diverifikasi." },
      { status: 401 },
    );
  }

  if (!user) {
    if (publicPaths.has(path)) return response;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/masuk";
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: "Profil gagal diverifikasi." }, { status: 500 });
  }

  if (!profile && path !== "/mulai") {
    const setupUrl = request.nextUrl.clone();
    setupUrl.pathname = "/mulai";
    setupUrl.search = "";
    return NextResponse.redirect(setupUrl);
  }
  if (profile && (path === "/mulai" || publicPaths.has(path))) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
