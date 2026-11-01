import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" prefetch={false}>BANGUN<span>BADAN</span></Link>
        <p className="eyebrow">SELAMAT DATANG KEMBALI</p>
        <h1>Masuk dan<br /><span>mulai bergerak.</span></h1>
        <AuthForm mode="login" />
        <p className="auth-switch">
          Belum punya akun? <Link href="/daftar">Daftar</Link>
        </p>
      </section>
    </main>
  );
}
