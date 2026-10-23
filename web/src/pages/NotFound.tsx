import { useNavigate } from "react-router-dom";
import { ArrowLeft, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-5">
      <div className="max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Store className="size-6" aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-indigo-600">Kesalahan 404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Halaman tidak ditemukan</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Halaman yang Anda cari tidak tersedia atau alamatnya sudah berubah.
        </p>
        <Button className="mt-6" onClick={() => navigate("/")}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Kembali ke dashboard
        </Button>
      </div>
    </main>
  );
}
