import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" prefetch={false}>BANGUN<span>BADAN</span></Link>
        <p className="eyebrow">SATU SESI LEBIH KUAT</p>
        <h1>Buat akun<br /><span>Bangun Badan.</span></h1>
        <AuthForm mode="signup" />
        <p className="auth-switch">
          Sudah punya akun? <Link href="/masuk">Masuk</Link>
        </p>
        <p className="health-note">
          Aplikasi ini bukan pengganti saran dokter. Jika kamu punya cedera,
          penyakit, atau kondisi khusus, konsultasikan dulu sebelum berlatih.
        </p>
      </section>
    </main>
  );
}
