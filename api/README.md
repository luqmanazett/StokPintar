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

## Stok opname

`/api/stock-opnames` membuat snapshot semua produk aktif atau satu kategori. Gudang mengisi hitungan fisik; ADMIN/MANAJER memfinalisasi dalam transaksi yang mengunci baris produk. Jika ledger berubah sejak snapshot, selisih dihitung dari stok terkini dan endpoint finalisasi mengembalikan daftar peringatan.

## Retur penjualan

ADMIN dan MANAJER mencatat retur parsial melalui `POST /api/sales/:id/returns` dengan alasan dan daftar `saleItemId`/jumlah. Sistem menolak retur melebihi sisa jumlah, mengembalikan stok melalui ledger, mengalokasikan diskon secara proporsional, dan menyimpan audit. Transaksi yang sudah memiliki retur tidak dapat dibatalkan agar stok tidak dikembalikan dua kali. Laporan pendapatan, laba, grafik harian, dan produk terlaris mengurangi refund serta HPP barang yang dikembalikan.

## Pengeluaran dan laba-rugi

ADMIN dan MANAJER dapat mencatat pengeluaran melalui `POST /api/expenses` dan melihat daftar dengan filter tanggal di `GET /api/expenses`. Laporan `GET /api/reports/profit-loss` menghitung pendapatan bersih setelah refund, HPP bersih setelah barang retur, total pengeluaran, serta laba bersih untuk rentang tanggal yang diminta. Halaman Keuangan menyediakan unduhan CSV untuk ringkasan laba-rugi dan daftar pengeluaran. Pencatatan pengeluaran disimpan bersama jejak audit.

## Data demo dan integritas

Seed demo mengisi akun empat role, produk/stok contoh, satu PO draft, satu pengeluaran, dan satu transaksi contoh. Seed hanya boleh dijalankan secara eksplisit terhadap database bernama `stokpintar` atau `stokpintar_demo`, bukan pada production. Jalankan dari folder `api/` setelah memastikan `DATABASE_URL` menunjuk ke database lokal yang benar:

```powershell
$env:SEED_DEMO_CONFIRM = "YES"
npm run db:seed
Remove-Item Env:SEED_DEMO_CONFIRM
```

Akun contoh: `admin@stokpintar.test` / `admin123`, `manajer@stokpintar.test` / `manajer123`, `gudang@stokpintar.test` / `gudang123`, dan `kasir@stokpintar.test` / `kasir123`. Ganti kata sandi sebelum memakai data di luar demo.

Pemeriksaan integritas hanya membaca data dan tersedia untuk ADMIN melalui menu **Integritas data**, endpoint `GET /api/integrity/check`, atau CLI:

```sh
npm run db:check
```

CLI mengembalikan status gagal bila ada saldo stok negatif atau hubungan/perhitungan penjualan, retur, PO, opname, maupun pengeluaran yang tidak konsisten.
