# Penjelasan Modul StokPintar

Dokumen ini menjelaskan modul M0 sampai M10 dengan bahasa sederhana. Setiap bagian merangkum tujuan bisnis, tabel dan hubungannya, cara fitur berjalan, bagian kode penting, penanganan kegagalan, serta contoh pertanyaan wawancara.

> Setelah modul berikutnya selesai, tambahkan bagian baru dengan enam subbagian yang sama. Sesuaikan penjelasan dengan kode dan tes yang benar-benar dibuat.

## M0 — Fondasi tes API

### 1. Masalah bisnis yang diselesaikan

Perubahan backend perlu diuji tanpa merusak data toko. M0 menyediakan tes integrasi yang menjalankan API sungguhan terhadap database PostgreSQL khusus bernama `stokpintar_test`, terpisah dari database pengembangan dan produksi. M0 adalah fondasi pengujian, bukan fitur bisnis baru.

### 2. Tabel dan relasinya

M0 tidak menambah tabel bisnis. Tes menggunakan tabel yang sudah ada sesuai migrasi, terutama:

- `User` menyimpan pengguna tes.
- `Category` berhubungan dengan banyak `Product`.
- `Product` berhubungan dengan banyak `StockMovement`.
- Catatan penjualan, pembelian, opname, audit, dan retur juga tersedia sesuai migrasi masing-masing modul.

Helper tes menghapus data dalam urutan yang menghormati relasi foreign key. Sebagai contoh, baris retur dihapus sebelum penjualan dan pengguna.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Pengembang mengatur `DATABASE_URL_TEST` ke database `stokpintar_test`.
2. Perintah tes atau migrasi masuk melalui `scripts/with-test-db.cjs`.
3. Script memeriksa format URL, nama database, dan jenis perintah yang diizinkan.
4. Script menjalankan Vitest atau Prisma dengan koneksi database tes.
5. Setiap tes membersihkan data sebelumnya, membuat data contoh, lalu mengirim HTTP request ke aplikasi Express melalui Supertest.
6. Tes memeriksa status HTTP dan perubahan data di PostgreSQL.

### 4. Bagian kode yang paling penting

- `api/src/app.ts`, fungsi `createApp()` — menyusun middleware dan route tanpa membuka port jaringan. Ini memudahkan tes mengirim request langsung ke aplikasi.
- `api/src/index.ts` — menjalankan server HTTP saat aplikasi dipakai normal; pemanggilan `listen()` hanya dilakukan jika file ini dijalankan langsung.
- `api/scripts/with-test-db.cjs` — memastikan migrasi dan tes hanya memakai database bernama `stokpintar_test`.
- `api/tests/helpers.ts`, fungsi `resetDatabase()`, `createUser()`, dan `createProduct()` — menyiapkan dan membersihkan data tes.
- `api/package.json` — menyediakan perintah `npm test` dan `npm run test:db:deploy`.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Jika `DATABASE_URL_TEST` tidak ada, bukan URL PostgreSQL, memakai nama database yang salah, atau perintahnya tidak diizinkan, script berhenti sebelum menjalankan tes atau migrasi. Jika request atau pemeriksaan tes gagal, Vitest menandai tes sebagai gagal. Setiap tes berikutnya tetap memulai dari pembersihan data. Karena perintah dibatasi ke `stokpintar_test`, kegagalan tes tidak semestinya menghapus data toko di database lain.

### 6. Pertanyaan interviewer dan jawabannya

1. **Mengapa tes memakai database terpisah?**  
   Agar tes dapat membuat dan menghapus data dengan bebas tanpa menyentuh database pengembangan atau produksi.
2. **Mengapa memakai `createApp()`?**  
   Agar konfigurasi route dapat dipakai oleh server biasa maupun Supertest, tanpa harus membuka port saat tes.
3. **Bagaimana mencegah tes berjalan di database yang salah?**  
   Script memeriksa URL dan memastikan nama databasenya tepat `stokpintar_test` sebelum menjalankan Prisma atau Vitest.

## M1 — Peran, akun, dan audit

### 1. Masalah bisnis yang diselesaikan

Toko memiliki pekerjaan berbeda: admin mengatur sistem, manajer mengawasi kegiatan, gudang menangani stok, dan kasir melayani penjualan. M1 menerapkan batas akses berdasarkan peran, pengelolaan akun, pembatasan percobaan login, serta catatan perubahan penting agar aktivitas dapat ditinjau.

### 2. Tabel dan relasinya

- `User` menyimpan nama, email, hash kata sandi, peran, dan status aktif.
- `Role` adalah enum yang berisi `ADMIN`, `MANAJER`, `GUDANG`, dan `KASIR`.
- `AuditLog` menyimpan pelaku (`userId`), tindakan, jenis dan ID data yang berubah, nilai sebelum/sesudah, alamat IP, serta waktu.
- Relasi `User` ke `AuditLog` adalah satu pengguna ke banyak catatan audit. Foreign key `AuditLog.userId` menunjuk ke `User.id`.

Kata sandi asli tidak disimpan; database menyimpan hasil hash.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Saat login, server memvalidasi email dan kata sandi, lalu memeriksa bahwa akun aktif.
2. Jika cocok, server membuat JWT yang berlaku delapan jam. Batas login membolehkan paling banyak sepuluh percobaan dalam 15 menit per jendela pembatas.
3. Pada request terproteksi, `requireAuth` memeriksa JWT dan membaca ulang status aktif serta peran pengguna dari database.
4. `requireRole` membandingkan peran tersebut dengan peran yang diizinkan oleh endpoint.
5. Admin dapat membuat, melihat, atau mengubah akun. Pengguna yang login dapat mengganti kata sandinya dengan terlebih dahulu memberikan kata sandi saat ini.
6. Perubahan akun dan tindakan penting lain menyimpan catatan `AuditLog` dalam transaksi yang sama dengan perubahan data.
7. Admin dapat menelusuri log melalui endpoint audit.

### 4. Bagian kode yang paling penting

- `api/src/middlewares/auth.ts`, fungsi `requireAuth()` — memverifikasi token, memastikan akun masih aktif, dan mengisi identitas pengguna pada request.
- `api/src/middlewares/auth.ts`, fungsi `requireRole()` — menolak akses ketika peran tidak cocok.
- `api/src/routes/auth.ts`, route `/login`, `/users`, dan `/change-password` — menangani autentikasi dan pengelolaan akun.
- `api/src/routes/auth.ts`, `loginLimiter` — membatasi percobaan login.
- `api/src/services/audit.ts`, fungsi `audit()` — menulis catatan audit menggunakan transaksi Prisma yang sedang berjalan.
- `api/src/routes/audit-logs.ts` — menyediakan pencarian log khusus admin.
- `api/prisma/migrations/20261023135828_roles_and_audit/migration.sql` — menambah peran baru dan tabel audit.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Email atau kata sandi yang salah, akun tidak aktif, atau token tidak sah menghasilkan penolakan akses. Peran yang tidak diizinkan mendapat respons akses ditolak. Jika validasi perubahan akun gagal, perubahan tidak dilakukan. Jika pencatatan audit gagal dalam transaksi perubahan akun, transaksi dibatalkan sehingga perubahan akun dan catatannya tidak terpisah. Kata sandi tidak disertakan dalam isi audit.

### 6. Pertanyaan interviewer dan jawabannya

1. **Apa bedanya autentikasi dan otorisasi?**  
   Autentikasi memastikan siapa penggunanya, misalnya lewat JWT. Otorisasi memastikan tindakan apa yang boleh dilakukan pengguna berdasarkan perannya.
2. **Mengapa server membaca status akun dari database pada setiap request?**  
   Agar akun yang dinonaktifkan langsung kehilangan akses walaupun tokennya belum kedaluwarsa.
3. **Mengapa catatan audit dibuat dalam transaksi yang sama?**  
   Agar perubahan bisnis dan jejaknya berhasil bersama-sama atau sama-sama dibatalkan.

## M2 — Pemasok dan pesanan pembelian

### 1. Masalah bisnis yang diselesaikan

Toko perlu mencatat dari siapa barang dipesan, jumlah dan harga modal yang disepakati, serta berapa barang yang sudah datang. M2 mengatur pesanan pembelian bertahap supaya stok baru bertambah ketika barang benar-benar diterima, bukan hanya ketika pesanan dibuat.

### 2. Tabel dan relasinya

- `Supplier` menyimpan data pemasok. Pemasok memiliki banyak `PurchaseOrder`; pemasok yang tidak dipakai lagi dinonaktifkan, bukan dihapus.
- `PurchaseOrder` menyimpan nomor pesanan, pemasok, status, pembuat, dan waktu. Statusnya antara lain `DRAFT`, `ORDERED`, `PARTIAL`, `RECEIVED`, dan `CANCELLED`.
- `PurchaseOrderItem` menghubungkan satu pesanan dengan satu produk serta menyimpan jumlah dipesan, jumlah diterima, dan modal pesanan. Kombinasi pesanan dan produk bersifat unik.
- `GoodsReceipt` mencatat satu kejadian penerimaan dan menghubungkan penerimaan ke pesanan.
- `GoodsReceiptItem` menghubungkan penerimaan ke baris pesanan dan mencatat jumlah yang datang.
- `StockMovement` mencatat perubahan stok bertipe `PURCHASE` dan menunjuk ke penerimaan. Saldo stok dihitung dari jumlah seluruh perubahan ledger.
- `User` terhubung ke pesanan dan penerimaan sebagai pembuat.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Admin atau manajer membuat pemasok dan membuat PO berisi pemasok, produk, jumlah, serta modal per unit.
2. Server memeriksa pemasok dan produk masih aktif, lalu membuat nomor PO berurutan per bulan.
3. Selama status `DRAFT`, admin atau manajer boleh mengubah isi pesanan.
4. Setelah dikirim, status berubah menjadi `ORDERED`; barang belum menambah stok.
5. Admin atau gudang mencatat barang yang benar-benar datang. Penerimaan sebagian diperbolehkan.
6. Untuk setiap penerimaan, server membuat `GoodsReceipt`, memperbarui jumlah diterima, menambah `StockMovement` bertipe `PURCHASE`, dan menghitung ulang modal rata-rata tertimbang.
7. Status menjadi `PARTIAL` jika masih ada sisa pesanan, atau `RECEIVED` jika semua jumlah terpenuhi.
8. Perubahan penting dicatat dalam audit.

### 4. Bagian kode yang paling penting

- `api/src/routes/suppliers.ts` — operasi daftar, tambah, ubah, dan arsip pemasok.
- `api/src/routes/purchase-orders.ts`, route `POST /` — validasi dan pembuatan PO.
- `api/src/routes/purchase-orders.ts`, route `POST /:id/order` — mengubah PO draft menjadi pesanan terkirim.
- `api/src/routes/purchase-orders.ts`, route `POST /:id/receive` — penerimaan bertahap, ledger stok, pembaruan modal dan status PO.
- `api/src/services/stock.ts`, fungsi `getStock()` — menghitung stok dari ledger pergerakan.
- `api/prisma/migrations/20261023140511_supplier_purchase_orders/migration.sql` — menambah tabel pemasok, PO, dan penerimaan.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Penerimaan dijalankan dalam satu transaksi database. Jika jumlah melebihi sisa PO, baris tidak termasuk PO, atau proses penyimpanan salah satu perubahan gagal, seluruh transaksi penerimaan dibatalkan: tidak ada penerimaan parsial yang tersimpan, stok tidak berubah, dan modal tidak berubah. PO hanya bisa diubah saat `DRAFT`; pesanan yang sudah menerima barang tidak dapat dibatalkan. Penguncian baris pesanan dan produk membantu mencegah dua penerimaan bersamaan membaca sisa jumlah atau stok yang sama.

### 6. Pertanyaan interviewer dan jawabannya

1. **Mengapa PO dan penerimaan barang disimpan sebagai data berbeda?**  
   Karena jumlah yang dipesan belum tentu datang sekaligus. Pemisahan ini menjaga riwayat pesanan dan setiap penerimaan tetap jelas.
2. **Bagaimana sistem menghitung modal rata-rata tertimbang?**  
   Sistem menggabungkan nilai stok lama dan nilai barang yang baru diterima, lalu membagi total nilai dengan jumlah stok setelah penerimaan.
3. **Apa manfaat transaksi database pada penerimaan?**  
   Semua perubahan terkait—catatan penerimaan, jumlah diterima, ledger stok, dan modal—berhasil bersama atau dibatalkan bersama.

## M3 — Stok opname

### 1. Masalah bisnis yang diselesaikan

Jumlah di sistem bisa berbeda dari barang yang benar-benar ada, misalnya karena barang rusak atau kesalahan pencatatan. M3 memungkinkan gudang menghitung fisik, membandingkannya dengan sistem, lalu manajer atau admin mencatat penyesuaian dengan riwayat yang bisa diperiksa.

### 2. Tabel dan relasinya

- `StockOpname` menyimpan nomor opname, status, pembuat, catatan, kategori opsional, dan waktu.
- `StockOpnameItem` adalah daftar produk dalam satu opname. Setiap baris menyimpan stok saat snapshot (`systemQty`), jumlah fisik (`countedQty`), selisih final (`difference`), dan modal saat opname dibuka (`unitCostAtOpen`).
- Satu `StockOpname` memiliki banyak `StockOpnameItem`; tiap item menunjuk satu `Product`. Produk tidak boleh muncul dua kali dalam opname yang sama.
- `StockMovement` menyimpan selisih final bertipe `OPNAME` dan menunjuk ke opname terkait.
- `User` terhubung ke opname sebagai pembuat. `Category` opsional membatasi produk yang ikut dihitung.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Gudang, manajer, atau admin membuat opname untuk semua produk aktif atau satu kategori.
2. Sistem mengunci produk saat membuat snapshot, menghitung stok dari ledger, dan menyimpan jumlah awal di `StockOpnameItem`.
3. Gudang menghitung barang fisik dan mengisi `countedQty`. Hitungan masih dapat diperbarui selama status `DRAFT`.
4. Admin atau manajer memfinalisasi opname setelah semua jumlah fisik terisi.
5. Server mengunci opname dan produk, lalu menghitung selisih terhadap stok ledger terkini.
6. Jika stok berubah sejak snapshot, respons memuat peringatan yang membandingkan jumlah snapshot, stok saat ini, dan hasil hitung fisik.
7. Sistem mencatat perbedaan sebagai `StockMovement` bertipe `OPNAME` dan mengubah status menjadi `FINALIZED`.

### 4. Bagian kode yang paling penting

- `api/src/routes/stock-opnames.ts`, route `POST /` — membuat snapshot stok.
- `api/src/routes/stock-opnames.ts`, route `PUT /:id/items` — menyimpan hitungan fisik selama opname masih draft.
- `api/src/routes/stock-opnames.ts`, route `POST /:id/finalize` — memvalidasi kelengkapan, menghitung perbedaan terkini, mencatat movement, dan memfinalisasi.
- `api/src/services/stock.ts`, fungsi `getStock()` — menjadi sumber saldo ledger.
- `api/prisma/migrations/20261023141207_stock_opname/migration.sql` dan `api/prisma/migrations/20261023141445_opname_movement_type/migration.sql` — menambah tabel opname dan tipe movement-nya.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Opname tidak dapat difinalisasi jika masih ada barang yang belum dihitung, sudah final, atau datanya tidak valid. Jika proses finalisasi gagal, transaksi membatalkan sekaligus perubahan selisih, movement stok, audit, dan perubahan status. Jika stok berubah setelah snapshot dibuat, sistem tidak diam-diam memakai angka lama: sistem memberi peringatan dan menghitung penyesuaian dari stok terkini. Gudang dapat menghitung dan mengisi, tetapi hanya admin atau manajer yang dapat memfinalisasi.

### 6. Pertanyaan interviewer dan jawabannya

1. **Mengapa sistem menyimpan snapshot stok awal?**  
   Agar ada pembanding yang menunjukkan kondisi sistem ketika proses hitung dimulai.
2. **Jika stok berubah saat opname berlangsung, angka mana yang dipakai untuk koreksi?**  
   Stok ledger terkini dipakai untuk koreksi, sedangkan perbedaan dari snapshot dilaporkan sebagai peringatan.
3. **Mengapa opname yang sudah final tidak bisa diedit atau difinalisasi ulang?**  
   Untuk mencegah penyesuaian stok ganda dan menjaga hasil opname yang sudah disahkan tetap konsisten.

## M4 — Retur penjualan

### 1. Masalah bisnis yang diselesaikan

Barang yang sudah terjual kadang dikembalikan. M4 mencatat alasan dan jumlah barang retur, mengembalikan stok, menghitung pengembalian uang dengan memperhitungkan diskon, serta mengoreksi laporan pendapatan dan laba. Fitur ini menghindari pembatalan seluruh transaksi hanya untuk mengembalikan sebagian barang.

### 2. Tabel dan relasinya

- `Sale` menyimpan transaksi dan memiliki banyak `SaleItem`.
- `SaleItem` menyimpan produk, jumlah terjual, harga jual, dan modal per unit saat transaksi dibuat. Nilai ini menjadi dasar perhitungan retur meskipun harga produk berubah kemudian.
- `SaleReturn` menyimpan transaksi asal, alasan retur, total refund, pembuat, dan waktu.
- `SaleReturnItem` menghubungkan satu retur ke satu `SaleItem`, beserta jumlah dan nilai refund. Satu sale item hanya muncul sekali di satu retur.
- `StockMovement` mencatat barang yang kembali dengan tipe `SALE_RETURN`, serta menghubungkan movement ke penjualan dan retur.
- `User` terhubung ke retur sebagai pembuat. `AuditLog` mencatat perubahan retur.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Admin atau manajer memilih transaksi yang statusnya `COMPLETED`, mengisi alasan, dan jumlah retur untuk satu atau beberapa baris barang.
2. Server mengunci baris penjualan agar retur bersamaan tidak menghitung sisa barang secara keliru.
3. Server memastikan setiap barang berasal dari transaksi tersebut dan jumlah kumulatif retur tidak melebihi jumlah terjual.
4. Diskon transaksi dibagi ke tiap baris berdasarkan nilai barang. Bagian diskon untuk jumlah yang dikembalikan dikurangkan dari refund.
5. Sistem membuat `SaleReturn` dan `SaleReturnItem`, menambah stok melalui ledger, serta menulis audit dalam satu transaksi database.
6. Daftar transaksi menampilkan jumlah barang yang telah diretur. Void ditolak setelah ada retur agar stok tidak dikembalikan dua kali.
7. Laporan ringkasan, harian, dan produk terlaris mengurangi refund; perhitungan laba juga mengembalikan HPP barang yang diretur.

### 4. Bagian kode yang paling penting

- `api/src/routes/sale-returns.ts`, route `POST /:id/returns` — memvalidasi retur dan menyimpan retur, movement, serta audit secara atomik.
- `api/src/routes/sale-returns.ts`, fungsi `allocateDiscount()` — membagi diskon per baris dengan perhitungan integer agar rupiah tidak hilang akibat pembulatan pecahan.
- `api/src/routes/sales.ts`, route `GET /` — menyertakan jumlah dan nilai barang yang sudah diretur dalam detail transaksi.
- `api/src/routes/sales.ts`, route `POST /:id/void` — menolak void jika retur sudah pernah dicatat.
- `api/src/routes/reports.ts`, route `/summary`, `/daily`, dan `/top-products` — menghitung angka bersih setelah retur.
- `web/src/pages/Transactions.tsx`, fungsi `openReturn()` dan `returnSale()` — membuka form retur, memvalidasi masukan, mengirim request, dan memuat ulang transaksi.
- `api/prisma/migrations/20261023141801_sale_returns/migration.sql` — menambah tabel retur, foreign key, indeks, dan tipe movement.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Retur hanya dapat dibuat untuk transaksi selesai, oleh admin atau manajer, dengan alasan dan jumlah yang valid. Jumlah berlebih atau barang yang bukan bagian transaksi ditolak. Penyimpanan retur, item retur, pergerakan stok, dan audit berada di satu transaksi; bila salah satunya gagal, semuanya dibatalkan. Penguncian penjualan membuat dua permintaan retur bersamaan memeriksa jumlah yang sudah diretur secara berurutan. Transaksi yang sudah diretur tidak dapat di-void, sehingga stok tidak menerima pengembalian ganda.

### 6. Pertanyaan interviewer dan jawabannya

1. **Bagaimana mencegah barang diretur lebih banyak daripada yang terjual?**  
   Sistem menjumlahkan retur sebelumnya untuk setiap baris penjualan, lalu membandingkan jumlah kumulatif dengan jumlah awal sebelum menyimpan.
2. **Bagaimana diskon transaksi memengaruhi pengembalian uang?**  
   Diskon dibagikan ke setiap baris sesuai nilai barang. Refund hanya membayar nilai barang yang kembali setelah bagian diskon untuk unit tersebut dikurangi.
3. **Mengapa transaksi yang sudah diretur tidak boleh di-void?**  
   Void mengembalikan stok untuk semua barang transaksi. Jika retur juga dilakukan, stok barang yang sama bisa bertambah dua kali.

## M5 — Pengeluaran, laporan laba-rugi, dan ekspor

### 1. Masalah bisnis yang diselesaikan

Melihat jumlah penjualan saja belum menunjukkan apakah toko benar-benar untung. Toko juga perlu mencatat biaya seperti listrik, sewa, atau transportasi. M5 mencatat pengeluaran per tanggal dan kategori, menghitung laba bersih setelah retur dan HPP, serta menyediakan unduhan CSV agar data mudah dibuka di spreadsheet.

### 2. Tabel dan relasinya

- `Expense` menyimpan kategori, keterangan opsional, jumlah rupiah, tanggal pengeluaran, waktu pencatatan, dan pengguna pencatat.
- `Expense.createdById` memiliki relasi ke `User.id`; satu pengguna dapat mencatat banyak pengeluaran.
- `AuditLog` mencatat tindakan `EXPENSE_CREATE` dan merujuk pengguna yang melakukan pencatatan.
- Indeks pada tanggal dan kategori membantu pencarian periode serta pengelompokan laporan.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Admin atau manajer membuka halaman Keuangan dan memilih rentang tanggal.
2. Halaman meminta daftar pengeluaran dan laporan laba-rugi untuk periode yang sama.
3. Pengguna mengisi kategori, jumlah rupiah, tanggal, serta keterangan opsional untuk pengeluaran baru.
4. Server memvalidasi data dan menyimpan pengeluaran beserta audit dalam transaksi.
5. Laporan menghitung pendapatan bersih setelah refund, HPP bersih setelah retur, total pengeluaran, dan laba bersih.
6. Pengguna dapat mengunduh ringkasan laba-rugi atau daftar pengeluaran sebagai CSV yang bisa dibuka di Excel atau aplikasi spreadsheet.

Rumus ringkasnya: **laba bersih = pendapatan setelah retur − HPP setelah retur − pengeluaran**.

### 4. Bagian kode yang paling penting

- `api/src/routes/expenses.ts`, route `GET /` — membaca pengeluaran dengan filter tanggal.
- `api/src/routes/expenses.ts`, route `POST /` — memvalidasi dan mencatat pengeluaran serta audit.
- `api/src/routes/reports.ts`, fungsi `calculateProfitLoss()` — menghitung ringkasan penjualan, refund, HPP, pengeluaran, dan laba.
- `api/src/routes/reports.ts`, route `GET /profit-loss` — mengembalikan ringkasan beserta jumlah pengeluaran per kategori.
- `web/src/pages/Finance.tsx`, fungsi `addExpense()`, `exportProfitLoss()`, dan `exportExpenses()` — mencatat pengeluaran dan membentuk file CSV.
- `api/prisma/migrations/20261023220300_expenses/migration.sql` — membuat tabel pengeluaran, indeks, dan relasi ke pengguna.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Input kategori, jumlah, tanggal, dan rentang filter divalidasi. Jumlah harus berupa bilangan rupiah positif; rentang tanggal yang terbalik ditolak. Jika penyimpanan audit gagal, catatan pengeluaran ikut dibatalkan karena keduanya satu transaksi. Jika data laporan gagal dimuat, halaman menampilkan pesan kesalahan dan tombol coba lagi. Ekspor CSV dibuat dari data periode yang sedang tampil; bila tidak ada data laporan, tombol ekspor laba-rugi dinonaktifkan.

### 6. Pertanyaan interviewer dan jawabannya

1. **Bagaimana laba bersih dihitung?**  
   Pendapatan penjualan dikurangi refund, lalu dikurangi HPP barang yang masih terjual dan pengeluaran pada periode tersebut.
2. **Mengapa pengeluaran memiliki tanggal kejadian dan waktu pencatatan?**  
   Tanggal kejadian menentukan periode laporan, sedangkan waktu pencatatan membantu mengetahui kapan data dimasukkan.
3. **Mengapa ekspor memakai CSV?**  
   CSV sederhana, dapat dibuka di Excel dan aplikasi spreadsheet lain, dan tidak memerlukan dependensi tambahan.

## M6 — Data demo dan pemeriksaan integritas

### 1. Masalah bisnis yang diselesaikan

Pengembang atau pemilik toko memerlukan data contoh untuk mencoba alur aplikasi, dan cara untuk menemukan catatan yang tidak konsisten sebelum dipakai membuat keputusan. M6 menyediakan seed demo yang bisa dijalankan ulang tanpa menggandakan contoh data, serta pemeriksaan baca-saja untuk saldo stok dan hubungan transaksi.

### 2. Tabel dan relasinya

Seed menyiapkan data pada tabel yang sudah ada, bukan membuat tabel baru:

- `User` berisi akun demo ADMIN, MANAJER, GUDANG, dan KASIR.
- `Category` terhubung ke `Product`; produk mempunyai saldo dari `StockMovement`.
- `Supplier` terhubung ke contoh `PurchaseOrder`, yang memiliki `PurchaseOrderItem`.
- `Expense` terhubung ke pengguna pencatat.
- `Sale` terhubung ke `SaleItem`, kasir, `StockMovement`, dan `AuditLog`.

Pemeriksaan integritas membaca produk dan ledger, penjualan beserta retur/void, purchase order beserta penerimaan, opname, dan pengeluaran. Fitur pemeriksaan tidak menulis atau memperbaiki data.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Untuk mengisi data demo, pengguna mengatur `SEED_DEMO_CONFIRM=YES`, memastikan database adalah `stokpintar` atau `stokpintar_demo`, lalu menjalankan `npm run db:seed` dari folder `api`.
2. Seed membuat akun demo, kategori dan produk contoh, saldo awal jika produk belum memiliki pergerakan stok, satu PO draft, satu pengeluaran, dan satu transaksi contoh bila stok mencukupi.
3. Seed menggunakan email, SKU, nomor PO, dan penanda data tetap. Saat dijalankan ulang, data yang sudah ada dipakai kembali dan tidak menambah transaksi contoh atau saldo stok awal berulang.
4. Admin dapat membuka menu **Integritas data** atau menjalankan `npm run db:check` untuk memeriksa konsistensi database.
5. Hasil pemeriksaan menunjukkan jumlah data yang diperiksa dan masalah yang ditemukan. CLI memberi kode keluar gagal jika ada masalah; endpoint admin mengembalikan hasil yang sama untuk ditampilkan di web.

### 4. Bagian kode yang paling penting

- `api/prisma/seed.ts`, fungsi `seedDemo()` — membuat akun dan fixture demo dengan pola idempoten.
- `api/prisma/seed.ts`, fungsi `assertDemoDatabase()` — menolak seed tanpa konfirmasi, pada production, atau pada database yang tidak diizinkan.
- `api/src/services/integrity.ts`, fungsi `runIntegrityChecks()` — memeriksa saldo stok, total/movement penjualan, PO, opname, dan pengeluaran.
- `api/src/routes/integrity.ts`, route `GET /check` — menyediakan pemeriksaan hanya untuk ADMIN.
- `api/scripts/check-integrity.ts` — menjalankan pemeriksaan melalui terminal tanpa mengubah database.
- `web/src/pages/Integrity.tsx` — menampilkan status dan rincian temuan untuk admin.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Seed berhenti sebelum menulis jika konfirmasi tidak diberikan, aplikasi berjalan dalam mode production, atau nama database tidak diizinkan. Jika pembuatan fixture gagal, error ditampilkan; data yang berhasil dibuat sebelumnya tetap tersimpan karena seed melengkapi banyak fixture secara idempoten, bukan menghapus database. Pemeriksaan integritas bersifat baca-saja. Jika kueri pemeriksaan gagal, endpoint/CLI melaporkan kegagalan; jika ditemukan ketidaksesuaian, CLI keluar dengan status gagal dan web menampilkan masalah untuk ditinjau. Pemeriksaan tidak otomatis mengubah stok atau transaksi.

### 6. Pertanyaan interviewer dan jawabannya

1. **Apa arti seed yang idempoten?**
   Jika dijalankan berulang, seed tidak membuat salinan baru dari data demo atau menambahkan saldo stok awal lagi.
2. **Mengapa seed memerlukan konfirmasi dan membatasi nama database?**
   Karena seed menulis data contoh. Konfirmasi dan pembatasan database membantu mencegah data demo masuk ke database yang salah.
3. **Apakah pemeriksaan integritas memperbaiki data secara otomatis?**
   Tidak. Pemeriksaan hanya melaporkan ketidaksesuaian agar admin dapat menyelidikinya tanpa perubahan diam-diam.

## M7 — Analitik usaha

### 1. Masalah bisnis yang diselesaikan

Ringkasan total saja belum cukup untuk memahami perubahan usaha. M7 memberi admin dan manajer perbandingan periode yang sama panjang, tren penjualan harian, perincian metode pembayaran, kinerja kasir, pengeluaran per kategori, dan produk terlaris.

### 2. Tabel dan relasinya

M7 memakai tabel yang sudah digunakan modul sebelumnya dan tidak menambah tabel baru:

- `Sale` terhubung ke `User` kasir dan memiliki banyak `SaleItem`.
- `SaleItem` terhubung ke `Product`, tempat kategori produk berasal.
- `SaleReturn` dan `SaleReturnItem` menghubungkan refund ke transaksi dan item asal.
- `Expense` menyimpan biaya per tanggal dan kategori.
- Angka laba memakai snapshot harga/modal dari `SaleItem`, biaya `Expense`, serta refund dari `SaleReturn`.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Admin atau manajer membuka menu **Analitik**, lalu memilih 7 hari, 30 hari, atau rentang tanggal sendiri.
2. Frontend mengirim tanggal awal dan akhir ke API laporan dengan encoding URL.
3. API menghitung ringkasan periode aktif dan periode sebelumnya dengan durasi yang sama.
4. API membandingkan transaksi, pendapatan, dan laba; persentase perubahan ditampilkan jika ada nilai pembanding.
5. Grafik menampilkan penjualan dan transaksi per hari; tabel menampilkan metode pembayaran, kasir, dan produk terlaris.
6. Pengeluaran dikelompokkan per kategori untuk periode yang dipilih, sementara refund mengurangi pendapatan dan HPP sesuai perhitungan laporan.

### 4. Bagian kode yang paling penting

- `api/src/routes/reports.ts`, route `GET /analytics` — menyusun perbandingan periode, metode pembayaran, kinerja kasir, dan biaya per kategori.
- `api/src/routes/reports.ts`, fungsi `calculateProfitLoss()` — menghitung pendapatan, refund, HPP, biaya, dan laba.
- `web/src/pages/Analytics.tsx`, fungsi `loadAnalytics()` — meminta ringkasan, grafik, dan produk terlaris untuk tanggal terpilih.
- `web/src/pages/Analytics.tsx`, komponen `InsightCard`, `BreakdownCard`, dan `ChangeBadge` — menampilkan KPI, rincian, dan perbandingan.
- `web/src/components/sales-chart.tsx`, komponen `SalesChart` — menggambar tren harian.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Rentang tanggal yang terbalik ditolak, dan role selain ADMIN/MANAJER tidak dapat memakai endpoint analitik. Jika salah satu request analitik gagal, halaman menampilkan pesan error dan tombol coba lagi, bukan angka sukses palsu. Jika periode sebelumnya tidak memiliki transaksi atau laba, perubahan persentase ditampilkan sebagai “Belum ada pembanding” ketika persentasenya tidak dapat dihitung. Modul ini membaca data dan tidak mengubah transaksi.

### 6. Pertanyaan interviewer dan jawabannya

1. **Mengapa membandingkan dengan periode yang sama panjang?**
   Agar perbandingan lebih adil, misalnya 7 hari terakhir dibandingkan dengan 7 hari sebelumnya, bukan dengan periode yang lebih panjang.
2. **Bagaimana retur memengaruhi angka analitik?**
   Refund mengurangi pendapatan dan biaya barang yang dikembalikan mengurangi HPP, sehingga pendapatan dan laba bersih tidak tampak lebih tinggi dari keadaan sebenarnya.
3. **Apakah M7 menambahkan tabel baru?**
   Tidak. Analitik mengolah relasi penjualan, item, retur, kasir, dan pengeluaran yang sudah disimpan modul sebelumnya.

## M8 — Notifikasi Telegram

### 1. Masalah bisnis yang diselesaikan

Pemilik toko tidak selalu membuka aplikasi untuk mengetahui ada transaksi baru atau stok yang mulai menipis. M8 mengirim ringkasan penjualan dan peringatan saat stok turun melewati batas minimum ke ruang chat Telegram yang telah dikonfigurasi.

### 2. Tabel dan relasinya

M8 tidak menambah tabel. Informasi penjualan dibaca dari `Sale`, sedangkan stok dihitung dari `StockMovement` dan batasnya berasal dari `Product.minStock`. Token bot dan ID chat disimpan sebagai environment server, bukan di database.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Pengelola server membuat bot Telegram dan mengatur `TELEGRAM_BOT_TOKEN` serta `TELEGRAM_CHAT_ID`.
2. ADMIN dapat mengirim pesan percobaan melalui `POST /api/notifications/telegram/test`.
3. Saat kasir membuat penjualan, API menyimpan transaksi dan pengurangan ledger stok dalam satu transaksi database.
4. Setelah transaksi berhasil, API mengirim ringkasan transaksi ke Telegram.
5. Jika penjualan, penyesuaian, atau hasil opname membuat jumlah melewati batas minimum ke bawah, API mengirim peringatan stok produk tersebut.
6. Jika pengaturan Telegram tidak tersedia, proses transaksi berjalan seperti biasa tanpa mengirim pesan.

### 4. Bagian kode yang paling penting

- `api/src/services/telegram.ts`, fungsi `sendTelegramMessage()` — mengirim pesan melalui Bot API dengan batas waktu dan pesan error yang tidak membocorkan token.
- `api/src/services/telegram.ts`, fungsi `notifyTelegramAfterCommit()` — mencatat kegagalan pengiriman tanpa membatalkan transaksi bisnis yang sudah tersimpan.
- `api/src/routes/notifications.ts`, route `POST /telegram/test` — menguji konfigurasi dan hanya mengizinkan ADMIN.
- `api/src/routes/sales.ts`, route `POST /` — membuat notifikasi transaksi dan mendeteksi stok yang melewati batas minimum.
- `api/src/routes/stock.ts`, route `POST /adjust` — mendeteksi penyesuaian stok yang membuat stok melewati batas minimum.
- `api/src/routes/stock-opnames.ts`, route `POST /:id/finalize` — memeriksa hasil stok fisik dan mengirim peringatan bila stok melewati batas minimum.
- `api/tests/telegram.test.ts` — menguji endpoint dan kegagalan pengiriman dengan fetch tiruan, tanpa menghubungi Telegram sungguhan.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Jika data atau transaksi gagal divalidasi, notifikasi tidak dikirim karena perubahan database belum berhasil. Jika Telegram menolak pesan, koneksi terputus, atau request melewati batas waktu, transaksi tetap berhasil dan API mencatat kegagalan pengiriman pada log server. Endpoint tes memberi respons error agar ADMIN mengetahui bahwa konfigurasi atau koneksi perlu diperiksa. Token bot tidak dikirim ke frontend dan tidak ditulis ke log aplikasi.

### 6. Pertanyaan interviewer dan jawabannya

1. **Mengapa notifikasi dikirim setelah transaksi database selesai?**
   Agar pesan tidak menyatakan transaksi berhasil sebelum data benar-benar tersimpan.
2. **Apa akibatnya jika Telegram sedang mati?**
   Penjualan atau perubahan stok tidak dibatalkan. Kegagalan pesan dicatat agar pengelola dapat memeriksa log server.
3. **Bagaimana token bot diamankan?**
   Token dan chat ID hanya dibaca dari environment backend, tidak disimpan di source code, frontend, atau tabel database.

## M9 — Pemindaian barcode produk

### 1. Masalah bisnis yang diselesaikan

Kasir perlu memilih barang dengan cepat dan tepat. M9 memungkinkan kode barcode disimpan pada produk dan dipindai di halaman Kasir menggunakan scanner USB/Bluetooth yang bekerja seperti keyboard, sehingga kasir tidak perlu mencari nama produk secara manual.

### 2. Tabel dan relasinya

Kolom `Product.barcode` ditambahkan sebagai teks opsional yang unik. Kolom ini tetap menjadi bagian dari tabel `Product`; relasi produk ke kategori, mutasi stok, dan item penjualan tidak berubah. Produk lama boleh tetap tidak memiliki barcode.

### 3. Alur langkah demi langkah saat fitur dipakai

1. ADMIN atau GUDANG membuka halaman Produk dan menambah atau mengedit produk.
2. Pengguna mengisi kolom Barcode (opsional) dengan angka/kode yang tercetak pada kemasan, atau membiarkannya kosong.
3. API menolak barcode yang sudah dipakai produk lain dan menyimpan nilainya pada `Product`.
4. Di halaman Kasir, kasir memfokuskan kolom pencarian lalu memindai kode barcode. Scanner biasanya mengetikkan kode dan mengirim Enter.
5. API mencari barcode bersama nama dan SKU. Jika hanya satu produk ditemukan, barang ditambahkan ke keranjang; stok habis menghasilkan pesan, bukan penambahan.
6. Kasir melanjutkan proses pembayaran seperti biasa. Scanner USB/Bluetooth tidak memerlukan koneksi khusus ke server; scanner mengirim karakter seperti keyboard.

### 4. Bagian kode yang paling penting

- `api/prisma/schema.prisma`, model `Product` — mendefinisikan barcode opsional dengan batasan unik.
- `api/prisma/migrations/20261023224700_product_barcode/migration.sql` — menambah kolom dan indeks unik tanpa mengubah produk lama.
- `api/src/routes/products.ts`, `GET /` — mengembalikan dan mencari barcode; route `POST /` dan `PUT /:id` memvalidasi duplikasi.
- `web/src/pages/Products.tsx`, fungsi `saveProduct()` — mengirim barcode dari formulir produk.
- `web/src/pages/Cashier.tsx`, fungsi `handleSearchKeyDown()` — mencari kode hasil scan dan menambah satu produk cocok ke keranjang.
- `api/tests/product-barcode.test.ts` — menguji pencarian barcode, larangan duplikat, dan penghapusan barcode.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Barcode duplikat ditolak dengan konflik sehingga nilainya tidak menimpa produk lain. Jika kode hasil scan tidak cocok dengan produk atau stok produk habis, halaman Kasir menampilkan pesan dan tidak membuat penjualan. Produk lama tetap dapat dicari menggunakan nama atau SKU karena barcode bersifat opsional. Jika migrasi belum diterapkan, backend belum memiliki kolom barcode; jalankan migrasi database sebelum memakai fitur ini.

### 6. Pertanyaan interviewer dan jawabannya

1. **Apakah aplikasi membutuhkan scanner model tertentu?**
   Tidak. Scanner USB/Bluetooth yang mengetikkan hasil scan seperti keyboard dapat digunakan; biasanya scanner mengirim Enter setelah kode.
2. **Apakah semua produk wajib memiliki barcode?**
   Tidak. Barcode opsional agar produk lama atau produk tanpa kode cetak tetap bisa dipakai dengan pencarian nama/SKU.
3. **Bagaimana mencegah kode scan yang sama memilih beberapa produk?**
   Database menerapkan indeks unik, dan API memeriksa duplikasi sebelum menyimpan; barcode yang sama tidak dapat terpasang pada dua produk.

## Showcase 1 — Mode demo

Mode demo memudahkan reviewer mencoba aplikasi memakai akun ADMIN, MANAJER, GUDANG, atau KASIR tanpa mengetik kredensial secara manual. Tombol **Masuk sebagai ...** hanya dimasukkan ke build frontend ketika environment `DEMO_MODE=true`; pada nilai default `false`, tombol tidak dirender dan form login tetap menggunakan email serta kata sandi yang diketik pengguna. Setiap tombol mengirim request login biasa ke endpoint yang sudah ada, jadi validasi akun dan penerbitan token tetap dilakukan oleh API tanpa perubahan kontrak. Kredensial demo sama dengan akun seed dan hanya boleh digunakan pada lingkungan demo yang memang diisi data contoh.

## Showcase 2 — Reset demo otomatis

Saat `DEMO_MODE=true`, API menjadwalkan reset setiap hari pukul 03.00 WIB memakai timer bawaan Node.js dan menjalankan `npm run seed:demo`; UI juga menampilkan banner bahwa data demo direset tiap malam. Skrip menghapus data terkait dalam satu transaksi lalu menjalankan seed demo kembali, sehingga akun dan contoh data kembali ke kondisi awal secara konsisten. Demi mencegah kehilangan data nyata, reset hanya diizinkan pada database khusus bernama `stokpintar_demo` dan memerlukan konfirmasi eksplisit, termasuk jika berjalan di server produksi. Penjadwal tidak berjalan saat mode demo mati, dan tidak menambah dependensi baru.

## Showcase 3 — Halaman depan publik

Pengunjung yang belum login akan melihat halaman depan StokPintar di `/`, sedangkan pengguna yang sudah memiliki token tetap langsung melihat dashboard pada alamat yang sama. Halaman depan memperkenalkan manfaat utama melalui empat kartu fitur, pratinjau visual dashboard, dan tombol untuk menuju login demo tanpa menambah endpoint atau mengubah alur autentikasi. Tautan GitHub mengarah ke pencarian repositori StokPintar karena repositori ini belum memiliki remote GitHub yang dikonfigurasi.

## Showcase 4 — Pencarian cepat

Tekan **Ctrl+K** (atau **Command+K** di macOS) saat sudah login untuk membuka palet pencarian. Nama halaman dicocokkan dengan menu yang memang boleh dilihat oleh peran pengguna, sedangkan pencarian produk memakai endpoint produk yang sudah ada setelah minimal dua karakter diketik. Memilih produk membuka halaman Produk dengan SKU produk tersebut sebagai kata pencarian, dan pesan kesalahan API ditampilkan langsung di palet tanpa mengubah kontrak backend.

## M10 — Docker, CI, dan dokumentasi akhir

### 1. Masalah bisnis yang diselesaikan

### 2. Tabel dan relasinya

M10 tidak menambah tabel bisnis. Docker Compose menjalankan PostgreSQL dengan volume bernama `postgres_data`, sementara migrasi Prisma membuat tabel aplikasi yang dibutuhkan. Volume menyimpan data database agar tetap ada setelah container dihentikan; menghapus volume juga menghapus data tersebut.

### 3. Alur langkah demi langkah saat fitur dipakai

1. Pengembang memasang dan menjalankan Docker Desktop, lalu menjalankan `docker compose up --build -d` dari root repositori.
2. Compose menunggu PostgreSQL sehat, lalu container migrasi menerapkan migrasi Prisma.
3. Setelah migrasi berhasil, API dimulai dan memeriksa endpoint health.
4. Web dibangun sebagai file statis dan disajikan Nginx di port lokal 8080. Nginx meneruskan request `/api` ke API, sehingga browser tidak perlu URL API terpisah.
5. Pengembang membuka `http://localhost:8080`; data demo dapat diisi secara eksplisit memakai perintah seed yang didokumentasikan di root README.
6. Pada push atau pull request, GitHub Actions menyiapkan PostgreSQL untuk tes, memasang dependensi dengan lockfile, menjalankan migrasi dan tes API, lalu build API, lint web, dan build web.

### 4. Bagian kode yang paling penting

- `docker-compose.yml` — mendefinisikan PostgreSQL, migrasi, API, web, urutan startup, health check, dan volume.
- `api/Dockerfile` — menghasilkan Prisma Client, mengompilasi TypeScript, lalu menjalankan API sebagai pengguna non-root.
- `web/Dockerfile` dan `web/nginx.conf` — membangun frontend dan menyajikan SPA sekaligus meneruskan API.
- `.github/workflows/ci.yml` — menjalankan pemeriksaan otomatis di GitHub Actions.
- `README.md` — instruksi menjalankan aplikasi, mengisi data demo, dan peringatan pengelolaan volume/secret.
- `api/README.md` dan `docs/PENJELASAN.md` — tetap menjelaskan konfigurasi backend dan seluruh modul.

### 5. Apa yang terjadi kalau ada yang gagal di tengah

Jika PostgreSQL belum sehat, migrasi menunggu dan API tidak dimulai lebih dulu. Jika migrasi gagal, Compose menandai container migrasi gagal sehingga API tidak diluncurkan dengan skema yang belum siap. Jika tes, lint, atau build gagal, job CI menjadi gagal dan perubahan perlu diperbaiki sebelum dinyatakan lolos. Data tersimpan pada volume Compose; `docker compose down` mempertahankannya, sedangkan `docker compose down -v` menghapus data. Nilai secret bawaan Compose hanya untuk demo lokal dan harus diganti untuk deployment.

### 6. Pertanyaan interviewer dan jawabannya

1. **Mengapa memakai container migrasi terpisah dari proses API?**
   Migrasi berjalan sekali dan harus sukses sebelum API menerima request, bukan dijalankan berulang oleh tiap instance API.
2. **Bagaimana CI menghindari menghapus database pengembangan?**
   Workflow membuat database PostgreSQL khusus bernama `stokpintar_test`; skrip tes juga menolak nama database lain.
3. **Apakah data hilang saat container dihentikan?**
   Tidak jika hanya menjalankan `docker compose down`, karena database memakai named volume. Data dihapus jika volume sengaja dihapus dengan `docker compose down -v`.

## Alur kerja berdasarkan role

Role menentukan pekerjaan harian pengguna. Menu di frontend membantu menampilkan fitur yang relevan, sementara API tetap memeriksa izin setiap kali ada request.

### ADMIN — mengatur dan mengawasi seluruh toko

1. Login dan membuka dashboard untuk memantau kondisi toko.
2. Menyiapkan data dasar seperti kategori, produk, stok, dan akun pengguna.
3. Membuat atau mengelola pemasok dan pesanan pembelian; admin juga dapat mencatat penerimaan barang.
4. Mengawasi transaksi dan laporan, serta melakukan void atau retur jika diperlukan.
5. Membuat opname, memasukkan hitungan bila perlu, lalu memfinalisasinya.
6. Membuka log audit untuk meninjau siapa yang melakukan perubahan.
7. Mencatat pengeluaran toko dan mengekspor laporan keuangan.
8. Menjalankan pemeriksaan integritas data.
9. Membandingkan tren dan kinerja usaha pada halaman analitik.

**Batas penting:** tindakan admin tetap mengikuti validasi bisnis. Contohnya, transaksi yang sudah memiliki retur tidak dapat di-void.

### MANAJER — mengelola operasi dan memeriksa hasil

1. Login dan memeriksa dashboard, laporan, serta riwayat transaksi.
2. Mengelola pemasok dan menyusun, mengubah, mengirim, atau membatalkan pesanan pembelian sebelum barang diterima.
3. Meninjau penerimaan yang dicatat tim gudang.
4. Membuat opname atau memeriksa hitungannya, kemudian memfinalisasi hasil.
5. Membatalkan transaksi yang memenuhi syarat atau mencatat retur barang.
6. Mencatat pengeluaran serta mengekspor laporan laba-rugi.
7. Membandingkan tren penjualan dan kinerja kasir pada halaman analitik.

**Batas penting:** manajer tidak mengelola akun, kategori, atau log audit. Manajer juga tidak mencatat penerimaan PO; pekerjaan itu diberikan kepada admin atau gudang.

### GUDANG — menjaga data barang dan kecocokan stok

1. Membuka daftar produk dan memperbarui data produk bila diperlukan.
2. Mencatat stok masuk atau penyesuaian stok dengan alasan yang sesuai.
3. Melihat pesanan pembelian yang perlu diproses dan mencatat barang yang benar-benar diterima, termasuk penerimaan sebagian.
4. Membuat opname untuk semua produk atau kategori tertentu.
5. Menghitung barang fisik dan menyimpan hasil hitungan pada opname yang masih draft.
6. Meminta admin atau manajer memeriksa dan memfinalisasi opname.

**Batas penting:** gudang tidak membuat, mengirim, atau membatalkan PO; tidak memfinalisasi opname; serta tidak mengakses laporan, akun, audit, retur, atau pembatalan transaksi.

### KASIR — melayani penjualan

1. Login dan membuka halaman kasir.
2. Mencari produk, memasukkan barang ke keranjang, memilih pembayaran, lalu menyelesaikan transaksi.
3. Membuka riwayat transaksi miliknya sendiri untuk melihat penjualan dan detailnya.
4. Meminta admin atau manajer menangani pembatalan atau retur jika terjadi kesalahan atau barang dikembalikan.

**Batas penting:** kasir tidak melihat transaksi kasir lain dan tidak dapat mengubah produk/stok, mengelola pembelian, memfinalisasi opname, melihat laporan, atau melakukan void dan retur.

### Ringkasan izin utama

| Pekerjaan | ADMIN | MANAJER | GUDANG | KASIR |
|---|---:|---:|---:|---:|
| Mengelola akun, kategori, dan log audit | Ya | Tidak | Tidak | Tidak |
| Membuat/ubah produk dan mencatat stok | Ya | Tidak | Ya | Tidak |
| Membuat dan mengirim PO | Ya | Ya | Tidak | Tidak |
| Mencatat penerimaan PO | Ya | Tidak | Ya | Tidak |
| Membuat dan mengisi opname | Ya | Ya | Ya | Tidak |
| Memfinalisasi opname | Ya | Ya | Tidak | Tidak |
| Membuat transaksi kasir | Ya | Tidak | Tidak | Ya |
| Melihat riwayat transaksi | Semua | Semua | Tidak | Milik sendiri |
| Void atau retur transaksi | Ya | Ya | Tidak | Tidak |
| Melihat laporan | Ya | Ya | Tidak | Tidak |
