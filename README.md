# FindMyPhone — Web App

Pantau lokasi beberapa HP sekaligus secara real-time dalam satu dashboard.

## Tech Stack
- Frontend: HTML + CSS + Vanilla JavaScript
- Hosting: Vercel (gratis)
- Peta: Leaflet.js + CartoDB Dark
- GPS: Browser Geolocation API
- Database: Supabase (PostgreSQL + Realtime)
- Auth: Supabase Auth
- Backend: Vercel Serverless Functions
- Notifikasi: Discord Webhook

## Struktur Folder
```
/
├── index.html          → Halaman login/register
├── dashboard.html      → Pantau semua HP di peta
├── tracker.html        → Dibuka di HP yang dipantau
├── tambah.html         → Tambah HP baru via QR code
├── share.html          → Lihat lokasi HP yang di-share (tanpa login)
├── riwayat.html        → History pergerakan HP
├── pengaturan.html     → Kelola device, geofence, notifikasi
├── vercel.json         → Konfigurasi Vercel + Cron Jobs
├── /api
│   ├── check-offline.js    → Cek HP offline > 15 menit
│   ├── check-battery.js    → Cek baterai kritis
│   └── geofence-check.js   → Cek HP keluar zona
└── /js
    ├── supabase.js     → Inisialisasi Supabase client
    └── auth.js         → Helper login/logout
```

## Setup

### 1. Supabase
1. Buat project di https://supabase.com
2. Jalankan SQL dari file `database.sql` di Supabase SQL Editor
3. Copy `Project URL` dan `anon key` dari Settings → API

### 2. Discord Webhook
1. Buka Discord → channel yang mau dipakai → Edit Channel → Integrations → Webhooks
2. Buat webhook baru, copy URL-nya

### 3. Deploy ke Vercel
1. Push project ini ke GitHub
2. Buka https://vercel.com/new → import repo
3. Tambahkan environment variables:
   - `SUPABASE_URL` → URL dari Supabase
   - `SUPABASE_ANON_KEY` → anon key dari Supabase
   - `SUPABASE_SERVICE_KEY` → service role key dari Supabase
   - `DISCORD_WEBHOOK_URL` → URL webhook Discord
4. Deploy!

### 4. Update Supabase URL di file JS
Ganti nilai di `js/supabase.js` dan `index.html`:
```
SUPABASE_URL = 'https://xxx.supabase.co'
SUPABASE_ANON_KEY = 'eyJ...'
```

> Tip: Setelah deploy, gunakan environment variable Vercel agar lebih aman.

## Cara Pakai
1. Buka URL Vercel kamu → Login/Register
2. Klik "Tambah HP" → scan QR di HP yang mau dipantau
3. HP buka link tracker → klik "Mulai Tracking" → izinkan GPS
4. HP langsung muncul di dashboard dengan marker real-time!
