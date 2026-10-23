# API StokPintar

## Test integrasi

Test memakai database PostgreSQL terpisah yang bernama `stokpintar_test`. Salin contoh URL pada `.env.test.example` ke variabel `DATABASE_URL_TEST` di lingkungan lokal, lalu sesuaikan kredensialnya. Jangan gunakan database pengembangan atau produksi: test menghapus data tabel sebelum tiap kasus.

Jalankan migrasi dan test dari folder `api/`:

```sh
npm run test:db:deploy
npm test
```

Script menolak URL yang tidak valid atau nama database selain `stokpintar_test`, dan tidak menggunakan `DATABASE_URL` sebagai cadangan. Untuk menjalankan test berulang saat mengubah kode, gunakan `npm run test:watch`.
