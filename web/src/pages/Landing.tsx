import {
  ArrowRight,
  Boxes,
  ChartNoAxesCombined,
  Code,
  ShieldCheck,
  ShoppingCart,
  Store,
} from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  {
    icon: Boxes,
    title: "Stok lebih terpantau",
    description: "Kelola produk, kategori, dan pergerakan stok dari satu tempat.",
  },
  {
    icon: ShoppingCart,
    title: "Transaksi lebih praktis",
    description: "Catat penjualan dengan alur kasir yang sederhana dan cepat.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Laporan mudah dipahami",
    description: "Tinjau ringkasan operasional untuk membantu keputusan harian.",
  },
  {
    icon: ShieldCheck,
    title: "Akses sesuai peran",
    description: "Fitur dan aktivitas disesuaikan dengan peran setiap anggota tim.",
  },
];

const chartBars = [34, 52, 42, 68, 55, 82, 63];

function DashboardPreview() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl shadow-indigo-950/10"
      aria-label="Pratinjau dashboard StokPintar"
    >
      <div className="flex h-11 items-center gap-1.5 border-b bg-slate-50 px-4">
        <span className="size-2.5 rounded-full bg-red-300" />
        <span className="size-2.5 rounded-full bg-amber-300" />
        <span className="size-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 rounded-md bg-white px-3 py-1 text-[10px] text-slate-400 shadow-sm">
          app.stokpintar
        </span>
      </div>
      <div className="grid min-h-72 grid-cols-[112px_1fr] sm:grid-cols-[150px_1fr]">
        <aside className="border-r bg-slate-50/70 p-3 sm:p-4">
          <div className="mb-5 flex items-center gap-2 text-xs font-semibold text-slate-800">
            <span className="flex size-6 items-center justify-center rounded-md bg-indigo-600 text-white">
              <Store className="size-3.5" aria-hidden="true" />
            </span>
            <span>StokPintar</span>
          </div>
          <div className="space-y-2 text-[10px] font-medium sm:text-xs">
            <div className="flex items-center gap-2 rounded-md bg-indigo-50 px-2 py-2 text-indigo-700">
              <ChartNoAxesCombined className="size-3.5" aria-hidden="true" />
              Dashboard
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-slate-500">
              <Boxes className="size-3.5" aria-hidden="true" />
              Produk
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-slate-500">
              <ShoppingCart className="size-3.5" aria-hidden="true" />
              Transaksi
            </div>
          </div>
        </aside>
        <div className="space-y-3 p-3 sm:space-y-4 sm:p-5">
          <div>
            <p className="text-[10px] text-slate-400 sm:text-xs">Ringkasan toko</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">Pantau bisnis hari ini</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {["Transaksi", "Pendapatan", "Produk"].map((label) => (
              <div key={label} className="rounded-lg border bg-white p-2 sm:p-3">
                <p className="text-[8px] text-slate-400 sm:text-[10px]">{label}</p>
                <div className="mt-2 h-3 w-3/4 rounded bg-slate-100 sm:h-4" />
                <div className="mt-1.5 h-2 w-1/2 rounded bg-slate-50" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-2 sm:gap-3">
            <div className="rounded-lg border p-2.5 sm:p-3">
              <p className="text-[9px] font-medium text-slate-700 sm:text-[11px]">Tren penjualan</p>
              <div className="mt-3 flex h-20 items-end gap-1.5 border-b border-l px-2 sm:h-24 sm:gap-2">
                {chartBars.map((height, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-t-sm bg-indigo-200"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg border p-2.5 sm:p-3">
              <p className="text-[9px] font-medium text-slate-700 sm:text-[11px]">Ringkasan stok</p>
              <div className="mt-3 space-y-2.5">
                {["Aman", "Menipis", "Perlu dicek"].map((label, index) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span
                      className={`size-1.5 rounded-full ${
                        index === 0 ? "bg-emerald-500" : index === 1 ? "bg-amber-400" : "bg-slate-300"
                      }`}
                    />
                    <span className="text-[8px] text-slate-500 sm:text-[10px]">{label}</span>
                    <span className="ml-auto h-2 w-5 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <main className="min-h-screen overflow-hidden bg-white">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="StokPintar, beranda">
          <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Store className="size-5" aria-hidden="true" />
          </span>
          <span className="font-semibold tracking-tight text-slate-900">StokPintar</span>
        </Link>
        <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-indigo-700">
          Masuk
        </Link>
      </header>

      <section className="relative isolate px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:pb-24 lg:pt-24">
        <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-gradient-to-b from-indigo-50/80 via-white to-white" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm">
              <span className="size-1.5 rounded-full bg-indigo-600" />
              Sistem manajemen toko
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-[3.5rem]">
              Kelola stok toko dengan lebih tenang.
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-slate-600 sm:text-lg lg:mx-0">
              Pantau produk, transaksi, dan aktivitas tim dalam satu aplikasi yang sederhana dan mudah digunakan.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                to="/login"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-indigo-700"
              >
                Coba demo
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="https://github.com/search?q=StokPintar&type=repositories"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Code className="size-4" aria-hidden="true" />
                Lihat di GitHub
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-400">Cocok untuk membantu operasional toko sehari-hari.</p>
          </div>
          <div className="mx-auto w-full max-w-2xl">
            <DashboardPreview />
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50/60 px-5 py-16 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-indigo-700">Semua yang dibutuhkan untuk mulai</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Operasional toko, lebih tertata.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              Satu tempat untuk mengelola aktivitas penting toko tanpa alur yang rumit.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-7 text-xs text-slate-500 sm:flex-row sm:px-8">
        <span>© StokPintar</span>
        <span>Dibuat untuk membantu toko tumbuh lebih teratur.</span>
      </footer>
    </main>
  );
}
