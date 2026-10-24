# StokPintar

Sistem stok dan penjualan untuk toko kecil. Monorepo ini berisi API Express/TypeScript/Prisma di `api/`, aplikasi React/Vite di `web/`, dan dokumentasi modul di `docs/`.

## Menjalankan dengan Docker

Persyaratan: Docker Desktop (termasuk Docker Compose) aktif.

Dari folder utama repositori, siapkan file konfigurasi lokal lalu jalankan:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

Compose menjalankan PostgreSQL, menerapkan migrasi Prisma, lalu memulai API dan web. Buka aplikasi di <http://localhost:8080>. API hanya tersedia melalui reverse proxy web; database juga tidak membuka port ke host.

Tombol login cepat empat role hanya ditanam ke build web jika `DEMO_MODE=true`. Untuk mengaktifkannya pada Docker lokal, ubah nilai tersebut di `.env`, lalu bangun ulang web dengan `docker compose build --no-cache web` dan jalankan `docker compose up -d`. Biarkan `DEMO_MODE=false` untuk build non-demo.

Reset demo otomatis hanya diizinkan pada database khusus bernama `stokpintar_demo`, bukan database aplikasi biasa. Untuk setup demo Docker yang baru, ubah `POSTGRES_DB` menjadi `stokpintar_demo` dan sesuaikan nama database pada `DATABASE_URL` serta set `DEMO_MODE=true` sebelum `docker compose up --build -d`; jalankan seed awal dengan konfirmasi `docker compose exec -e NODE_ENV=development -e DEMO_MODE=true -e SEED_DEMO_CONFIRM=YES api npm run db:seed`. Backend kemudian menjalankan reset setiap pukul 03.00 WIB menggunakan timer Node.js dan skrip `npm run seed:demo`. Untuk server lokal, atur `DEMO_MODE=true` dan `DATABASE_URL` ke database `stokpintar_demo` pada `api/.env`, lalu mulai API. Jangan aktifkan mode ini pada database toko yang berisi data nyata.

Untuk mengisi data contoh di instalasi lokal:

```powershell
docker compose exec -e NODE_ENV=development -e SEED_DEMO_CONFIRM=YES api npm run db:seed
```

Akun demo: `admin@stokpintar.test` / `admin123`, `manajer@stokpintar.test` / `manajer123`, `gudang@stokpintar.test` / `gudang123`, dan `kasir@stokpintar.test` / `kasir123`. Akun tersebut hanya untuk demo lokal; ganti kata sandi sebelum penggunaan bersama atau deployment.

Lihat log dengan `docker compose logs -f api`. Hentikan layanan tanpa menghapus data dengan `docker compose down`. **`docker compose down -v` menghapus volume database beserta datanya.**

File `.env.example` berisi nilai demo lokal. Sebelum deployment, ganti `POSTGRES_PASSWORD` dan `JWT_SECRET` dengan nilai kuat, pastikan password di `DATABASE_URL` di-URL-encode bila mengandung karakter khusus, atur `CORS_ORIGIN` sesuai domain, serta jangan commit `.env`. Host database dalam URL Compose harus tetap `db`. Telegram opsional melalui `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID`.

## Menjalankan untuk pengembangan

1. Siapkan PostgreSQL lalu atur `DATABASE_URL` dan `JWT_SECRET` di `api/.env`.
2. Dari `api/`, jalankan `npx prisma migrate deploy`, lalu `npm run dev`.
3. Dari `web/`, jalankan `npm run dev`; Vite menampilkan alamat lokal aplikasi.
4. Untuk data demo lokal, ikuti petunjuk seed pada [api/README.md](./api/README.md).

Tes API memerlukan PostgreSQL terpisah bernama `stokpintar_test` melalui `DATABASE_URL_TEST`. Lihat [api/README.md](./api/README.md) untuk menyiapkan database tes dan menjalankan migrasi serta tes. Jangan arahkan tes ke database pengembangan atau produksi.

## Modul dan dokumentasi

Penjelasan M0–M10, tabel yang digunakan, alur fitur, dan pertanyaan wawancara tersedia di [docs/PENJELASAN.md](./docs/PENJELASAN.md).
