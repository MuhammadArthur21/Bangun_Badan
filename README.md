# Bangun Badan

Aplikasi latihan berbahasa Indonesia untuk kalistenik di rumah dan gym.

## Menjalankan lokal

1. Gunakan Node.js 20.9 atau lebih baru.
2. Salin `.env.example` menjadi `.env.local`, lalu isi URL dan anon key Supabase.
3. Terapkan seluruh migrasi di `supabase/migrations` ke proyek Supabase.
4. Aktifkan pendaftaran email di Supabase Auth.
5. Isi katalog latihan. Tanpa service key: buka `supabase/seed-exercises.sql`, salin
   seluruh isinya ke Supabase SQL Editor, lalu Run. Atau jalankan `npm install` dan
   `npm run seed` dengan `SUPABASE_SERVICE_ROLE_KEY`.
6. Untuk email, konfigurasi `RESEND_API_KEY`, `RESEND_FROM`, dan `APP_URL`;
   pengguna dapat mengaktifkan pengingat email dari profil.
7. Untuk pengingat push, buat kunci dengan `npm run generate-vapid-keys`, simpan
   public/private key dan subject email VAPID di `.env.local`, dan atur `CRON_SECRET`.
   Jadwalkan POST ke `/api/notifications/dispatch` setiap lima menit dengan
   header `Authorization: Bearer <CRON_SECRET>`.
8. Jalankan `npm run dev`.

`SUPABASE_SERVICE_ROLE_KEY` hanya dipakai skrip seed dan proses pengiriman pengingat
di server. Jangan menambahkan key tersebut ke variabel `NEXT_PUBLIC_*` atau ke
kode klien. `CRON_SECRET` juga wajib dirahasiakan.

## Data latihan dan video

Katalog kurasi berisi 109 gerakan di `data/exercises-curated.json`.
`data/video-ids.json` sengaja kosong; isi hanya dengan ID video yang sudah
ditinjau manusia, lalu jalankan `npm run check-videos`. Pemeriksaan ini
mengonfirmasi ketersediaan oEmbed YouTube, bukan izin embed setiap video.
Seed bersifat idempoten dan meng-upsert berdasarkan ID latihan.

## Perintah pemeriksaan

- `npm run test` — tes mesin jadwal, denda, streak, zona waktu, dan katalog.
- `npm run typecheck` — pemeriksaan TypeScript.
- `npm run lint` — ESLint.
- `npm run build` — build Next.js.

## Status implementasi

Fitur aplikasi yang sudah terhubung:

- Pendaftaran/masuk Supabase dan wizard program lima langkah.
- Dashboard memuat profil, rencana hari ini, progres set, streak, suasana hati,
  dan denda dari API.
- Mode latihan menyimpan setiap set, dapat dilanjutkan, menyediakan timer
  istirahat, mencoba menjaga layar tetap aktif, serta menautkan video tutorial
  terverifikasi atau pencarian tutorial bila ID video belum tersedia.
- Kalender membaca status sesi per tanggal dan menyediakan feed langganan
  iCalendar (`.ics`).
- Pustaka latihan dengan filter berdasarkan target dan profil.
- Pengaturan profil, mulai ulang program, keluar, dan penghapusan akun.
- PWA yang dapat dipasang dengan service worker untuk notifikasi push.
- Pengingat push opt-in dan email opt-in sekitar 5–15 menit sebelum sesi;
  pengiriman terjadwal memerlukan cron eksternal yang memanggil endpoint
  terproteksi.
- Migrasi dengan RLS, seed katalog latihan kurasi, serta mesin jadwal/denda/
  streak yang memiliki tes unit.

Deploy dan pengujian end-to-end/RLS masih memerlukan konfigurasi eksternal.
Pengingat memerlukan kunci VAPID dan/atau konfigurasi Resend, serta scheduler
cron yang aktif. Feed `.ics` memerlukan Supabase service-role key di server.
Katalog video sengaja tidak mengarang ID; tautan pencarian dipakai sampai video
tertentu ditinjau dan diverifikasi.
