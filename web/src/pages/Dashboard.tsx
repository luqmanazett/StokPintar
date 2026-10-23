import { useEffect, useState } from "react";
import { api, rupiah } from "../api";

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
      <h1 className="text-xl font-bold">Dashboard hari ini</h1>

      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded bg-white p-4 shadow">
            Transaksi<p className="text-2xl font-bold">{summary.transactions}</p>
          </div>
          <div className="rounded bg-white p-4 shadow">
            Pendapatan<p className="text-2xl font-bold">{rupiah(summary.revenue)}</p>
          </div>
          <div className="rounded bg-white p-4 shadow">
            Laba<p className="text-2xl font-bold">{rupiah(summary.profit)}</p>
          </div>
        </div>
      )}

      {top.length > 0 && (
        <div className="rounded bg-white p-4 shadow">
          <h2 className="font-bold">Produk terlaris hari ini</h2>
          {top.map((t) => (
            <p key={t.name}>
              {t.name}: {t.quantity} terjual
            </p>
          ))}
        </div>
      )}

      <div className="rounded bg-white p-4 shadow">
        <h2 className="font-bold">Stok menipis</h2>
        {low.length === 0 && <p className="text-sm text-gray-500">Semua stok aman</p>}
        {low.map((l) => (
          <p key={l.id} className="text-red-600">
            {l.name}: sisa {l.stock} (minimum {l.minStock})
          </p>
        ))}
      </div>
    </div>
  );
}
