# API StokPintar

## Test integrasi

Test memakai database PostgreSQL terpisah yang bernama `stokpintar_test`. Salin contoh URL pada `.env.test.example` ke variabel `DATABASE_URL_TEST` di lingkungan lokal, lalu sesuaikan kredensialnya. Jangan gunakan database pengembangan atau produksi: test menghapus data tabel sebelum tiap kasus.

Jalankan migrasi dan test dari folder `api/`:

```sh
npm run test:db:deploy
npm test
```

Script menolak URL yang tidak valid atau nama database selain `stokpintar_test`, dan tidak menggunakan `DATABASE_URL` sebagai cadangan. Untuk menjalankan test berulang saat mengubah kode, gunakan `npm run test:watch`.

## Peran dan audit

Peran yang tersedia: ADMIN, MANAJER, GUDANG, dan KASIR. ADMIN mengelola semua fitur; MANAJER mengakses laporan dan transaksi; GUDANG mengelola produk serta stok; KASIR membuat penjualan dan hanya melihat transaksi miliknya. Perubahan data penting disimpan di `AuditLog`; endpoint `GET /api/audit-logs` hanya dapat diakses ADMIN dan mendukung filter `userId`, `entity`, `from`, `to`, `page`, dan `limit`.

## Pembelian

Pemasok dikelola melalui `/api/suppliers`. Siklus PO tersedia di `/api/purchase-orders`: buat dan ubah saat DRAFT, kirim, batalkan, lihat daftar/detail, lalu catat penerimaan sebagian atau penuh. Setiap penerimaan membuat `GoodsReceipt` dan `StockMovement` bertipe `PURCHASE` dalam satu transaksi, memperbarui jumlah diterima, dan menghitung ulang modal rata-rata tertimbang produk.
