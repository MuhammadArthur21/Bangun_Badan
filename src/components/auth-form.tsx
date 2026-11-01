"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setMessage("Pendaftaran berhasil. Periksa email untuk konfirmasi akun.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menghubungkan akun.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Kata sandi
        <input
          type="password"
          name="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mode === "signup" ? <small>Minimal 8 karakter.</small> : null}
      </label>
      {message ? <p className="form-message" role="status">{message}</p> : null}
      <button className="primary-button auth-submit" type="submit" disabled={busy}>
        {busy
          ? "Memproses..."
          : mode === "login"
            ? "Masuk"
            : "Buat akun"}
      </button>
    </form>
  );
}
