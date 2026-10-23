import { useEffect, useState } from "react";
import { api, rupiah } from "../api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Summary = { transactions: number; revenue: number; profit: number };
type Top = { name: string; quantity: number };
type Low = { id: number; name: string; stock: number; minStock: number };

export default function Dashboard() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [top, setTop] = useState<Top[]>([]);
  const [low, setLow] = useState<Low[]>([]);

  useEffect(() => {
    const today = new Date().toLocaleDateString("sv-SE"); // format YYYY-MM-DD
    const q = "?from=" + encodeURIComponent(today + "T00:00:00+07:00") + "&to=" + encodeURIComponent(today + "T23:59:59+07:00");

    api<Low[]>("/stock/low").then(setLow);
    if (user?.role === "ADMIN") {
      api<Summary>("/reports/summary" + q).then(setSummary);
      api<Top[]>("/reports/top-products" + q).then(setTop);
    }
  }, [user?.role]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Ringkasan aktivitas toko hari ini." />

      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            Transaksi<p className="text-2xl font-bold">{summary.transactions}</p>
          </Card>
          <Card className="p-5">
            Pendapatan<p className="text-2xl font-bold">{rupiah(summary.revenue)}</p>
          </Card>
          <Card className="p-5">
            Laba<p className="text-2xl font-bold">{rupiah(summary.profit)}</p>
          </Card>
        </div>
      )}

      {top.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold">Produk terlaris hari ini</h2>
          {top.map((t) => (
            <p key={t.name} className="mt-3 text-sm text-slate-600">
              {t.name}: <span className="font-medium text-slate-900">{t.quantity} terjual</span>
            </p>
          ))}
        </Card>
      )}

      <Card className="p-5">
        <h2 className="font-semibold">Stok menipis</h2>
        {low.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Semua stok aman</p>}
        {low.map((l) => (
          <p key={l.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-800">{l.name}</span>
            <Badge variant={l.stock === 0 ? "destructive" : "warning"}>
              Sisa {l.stock} (minimum {l.minStock})
            </Badge>
          </p>
        ))}
      </Card>
    </div>
  );
}
