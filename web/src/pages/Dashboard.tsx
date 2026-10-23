import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, rupiah } from "../api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Summary = { transactions: number; revenue: number; profit: number };
type Top = { name: string; quantity: number };
type Low = { id: number; name: string; stock: number; minStock: number };
type User = { role?: string } | null;

export default function Dashboard() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [top, setTop] = useState<Top[]>([]);
  const [low, setLow] = useState<Low[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const today = new Date().toLocaleDateString("sv-SE");
    const query =
      "?from=" +
      encodeURIComponent(today + "T00:00:00+07:00") +
      "&to=" +
      encodeURIComponent(today + "T23:59:59+07:00");
    const failures: string[] = [];

    const tasks = [
      (async () => {
        try {
          setLow(await api<Low[]>("/stock/low"));
        } catch (error) {
          failures.push((error as Error).message);
        }
      })(),
    ];

    if (user?.role === "ADMIN") {
      tasks.push(
        (async () => {
          try {
            setSummary(await api<Summary>("/reports/summary" + query));
          } catch (error) {
            failures.push((error as Error).message);
          }
        })(),
        (async () => {
          try {
            setTop(await api<Top[]>("/reports/top-products" + query));
          } catch (error) {
            failures.push((error as Error).message);
          }
        })(),
      );
    }

    await Promise.all(tasks);
    setErrors(failures);
    if (failures.length > 0) toast.error(failures[0]);
    setIsLoading(false);
  }, [user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Ringkasan aktivitas toko hari ini." />
      {errors.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>Data tidak dapat dimuat sepenuhnya: {errors.join(" · ")}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>Coba lagi</Button>
        </div>
      )}

      {user?.role === "ADMIN" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)
          ) : summary ? (
            <>
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">Transaksi</p>
                <p className="mt-2 text-2xl font-semibold">{summary.transactions}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">Pendapatan</p>
                <p className="mt-2 text-2xl font-semibold">{rupiah(summary.revenue)}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">Laba</p>
                <p className="mt-2 text-2xl font-semibold">{rupiah(summary.profit)}</p>
              </Card>
            </>
          ) : (
            <Card className="p-5 text-sm text-muted-foreground sm:col-span-3">
              Ringkasan belum tersedia.
            </Card>
          )}
        </div>
      )}

      {user?.role === "ADMIN" && (
        <Card className="p-5">
          <h2 className="font-semibold">Produk terlaris hari ini</h2>
          {isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : top.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Belum ada penjualan produk hari ini.</p>
          ) : (
            top.map((item) => (
              <p key={item.name} className="mt-3 text-sm text-slate-600">
                {item.name}: <span className="font-medium text-slate-900">{item.quantity} terjual</span>
              </p>
            ))
          )}
        </Card>
      )}

      <Card className="p-5">
        <h2 className="font-semibold">Stok menipis</h2>
        {isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : errors.length > 0 && low.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Data stok belum tersedia.</p>
        ) : low.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Semua stok aman.</p>
        ) : (
          low.map((item) => (
            <p key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-slate-800">{item.name}</span>
              <Badge variant={item.stock === 0 ? "destructive" : "warning"}>
                Sisa {item.stock} (minimum {item.minStock})
              </Badge>
            </p>
          ))
        )}
      </Card>
    </div>
  );
}
