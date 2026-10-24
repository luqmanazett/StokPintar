# StokPintar

Sistem stok dan penjualan untuk toko kecil. Monorepo ini berisi API Express/TypeScript/Prisma di `api/`, aplikasi React/Vite di `web/`, dan dokumentasi modul di `docs/`.

[![Status CI](https://github.com/luqmanazett/StokPintar/actions/workflows/ci.yml/badge.svg)](https://github.com/luqmanazett/StokPintar/actions/workflows/ci.yml)

Repositori: [luqmanazett/StokPintar](https://github.com/luqmanazett/StokPintar) · Demo online: _Belum tersedia_.

## Fitur utama

- Dashboard dan laporan untuk ADMIN serta MANAJER; akses menu disesuaikan dengan peran ADMIN, MANAJER, GUDANG, dan KASIR.
- Pengelolaan produk, kategori, barcode, saldo stok, pergerakan stok, dan notifikasi stok menipis.
- Transaksi kasir dengan diskon dan metode pembayaran, riwayat transaksi, pembatalan, serta retur parsial.
- Pengelolaan pemasok dan purchase order, penerimaan barang sebagian atau penuh, serta pembaruan modal rata-rata tertimbang.
- Stok opname dengan finalisasi dan pemeriksaan integritas data.
- Pengeluaran, laporan laba-rugi, analitik penjualan, ekspor CSV, dan jejak audit.
- Mode demo, tampilan responsif dan gelap, pencarian cepat, serta tur singkat pengguna baru.

## Arsitektur

```mermaid
flowchart LR
  browser["Browser pengguna"]
  ui["React + Vite<br/>UI aplikasi"]
  nginx["Nginx<br/>Docker lokal"]
  api["Express + TypeScript<br/>Prisma"]
  db[("PostgreSQL")]
  telegram["Telegram<br/>opsional"]
  ci["GitHub Actions"]
  checks["Tes API, lint, build"]

  static["React build<br/>file statis"]

  browser -->|Pengembangan: localhost:5173| ui
  browser -->|Docker: localhost:8080| nginx
  nginx -->|menyajikan| static
  nginx -->|reverse proxy /api| api
  ui -->|request API saat pengembangan| api
  api --> db
  api -.->|notifikasi opsional| telegram
  ci --> checks
```

## ERD

Diagram berikut merangkum model data utama dari Prisma:

```mermaid
erDiagram
  USER {
    int id PK
    string email UK
    string role
  }
  AUDIT_LOG {
    int id PK
    int userId FK
    string entity
  }
  CATEGORY {
    int id PK
    string name UK
  }
  PRODUCT {
    int id PK
    string sku UK
    string barcode UK
    int categoryId FK
  }
  STOCK_MOVEMENT {
    int id PK
    int productId FK
    int createdById FK
    int saleId FK
  }
  SALE {
    int id PK
    int cashierId FK
    int total
  }
  SALE_ITEM {
    int id PK
    int saleId FK
    int productId FK
  }
  SALE_RETURN {
    int id PK
    int saleId FK
    int createdById FK
  }
  SALE_RETURN_ITEM {
    int id PK
    int saleReturnId FK
    int saleItemId FK
  }
  SUPPLIER {
    int id PK
    string name
  }
  PURCHASE_ORDER {
    int id PK
    int supplierId FK
    int createdById FK
  }
  PURCHASE_ORDER_ITEM {
    int id PK
    int purchaseOrderId FK
    int productId FK
  }
  GOODS_RECEIPT {
    int id PK
    int purchaseOrderId FK
    int createdById FK
  }
  GOODS_RECEIPT_ITEM {
    int id PK
    int goodsReceiptId FK
    int purchaseOrderItemId FK
  }
  STOCK_OPNAME {
    int id PK
    int createdById FK
    int categoryId FK
  }
  STOCK_OPNAME_ITEM {
    int id PK
    int stockOpnameId FK
    int productId FK
  }
  EXPENSE {
    int id PK
    int createdById FK
    int amount
  }

  USER ||--o{ AUDIT_LOG : membuat
  USER ||--o{ SALE : melayani
  USER ||--o{ STOCK_MOVEMENT : mencatat
  USER ||--o{ PURCHASE_ORDER : membuat
  USER ||--o{ GOODS_RECEIPT : menerima
  USER ||--o{ STOCK_OPNAME : membuat
  USER ||--o{ SALE_RETURN : mencatat
  USER ||--o{ EXPENSE : mencatat
  CATEGORY ||--o{ PRODUCT : mengelompokkan
  CATEGORY o|--o{ STOCK_OPNAME : membatasi
  PRODUCT ||--o{ STOCK_MOVEMENT : memiliki
  PRODUCT ||--o{ SALE_ITEM : dijual
  SALE ||--o{ SALE_ITEM : berisi
  SALE o|--o{ STOCK_MOVEMENT : mengurangi_stok
  SALE ||--o{ SALE_RETURN : diretur
  SALE_ITEM ||--o{ SALE_RETURN_ITEM : diretur
  SALE_RETURN ||--o{ SALE_RETURN_ITEM : berisi
  SALE_RETURN o|--o{ STOCK_MOVEMENT : mengembalikan_stok
  SUPPLIER ||--o{ PURCHASE_ORDER : memasok
  PURCHASE_ORDER ||--o{ PURCHASE_ORDER_ITEM : berisi
  PRODUCT ||--o{ PURCHASE_ORDER_ITEM : dipesan
  PURCHASE_ORDER ||--o{ GOODS_RECEIPT : diterima
  GOODS_RECEIPT ||--o{ GOODS_RECEIPT_ITEM : berisi
  PURCHASE_ORDER_ITEM ||--o{ GOODS_RECEIPT_ITEM : diterima
  GOODS_RECEIPT o|--o{ STOCK_MOVEMENT : menambah_stok
  STOCK_OPNAME ||--o{ STOCK_OPNAME_ITEM : menghitung
  PRODUCT ||--o{ STOCK_OPNAME_ITEM : dihitung
  STOCK_OPNAME o|--o{ STOCK_MOVEMENT : menyesuaikan_stok
```

## Tampilan aplikasi

![Beranda StokPintar versi desktop](./docs/screenshots/beranda-desktop.png)

![Dashboard StokPintar versi desktop](./docs/screenshots/dashboard-desktop.png)

<details>
<summary>Pratinjau layar 375px</summary>

![Beranda StokPintar versi mobile](./docs/screenshots/beranda-375px.png)

![Dashboard StokPintar versi mobile](./docs/screenshots/dashboard-375px.png)

</details>

Screenshot seluruh halaman utama tersedia di [`docs/screenshots/`](./docs/screenshots/). Untuk membuat ulang, hidupkan API dan isi database demo, lalu jalankan `npm run screenshots` dari folder `web/`.

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

## Menjalankan manual untuk pengembangan

Persyaratan: Node.js 24, npm, dan PostgreSQL 16. Buat database lokal bernama `stokpintar`, kemudian buat `api/.env` dengan konfigurasi berikut (ganti kredensial serta secret untuk lingkungan sendiri):

```dotenv
DATABASE_URL=postgresql://stokpintar:password_lokal@localhost:5432/stokpintar?schema=public
JWT_SECRET=ganti-dengan-secret-lokal-yang-kuat
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

Jalankan API di terminal pertama:

```powershell
Set-Location api
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Jalankan web di terminal kedua:

```powershell
Set-Location web
npm ci
npm run dev
```

Buka <http://localhost:5173>. Untuk mengisi data dan akun demo, ikuti petunjuk seed pada [api/README.md](./api/README.md). Tes API memerlukan PostgreSQL terpisah bernama `stokpintar_test` melalui `DATABASE_URL_TEST`; lihat panduan API untuk menyiapkan dan menjalankan tes. Jangan arahkan tes ke database pengembangan atau produksi.

## Modul dan dokumentasi

Penjelasan M0–M10, tabel yang digunakan, alur fitur, dan pertanyaan wawancara tersedia di [docs/PENJELASAN.md](./docs/PENJELASAN.md).
