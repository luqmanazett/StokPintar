import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Activity, Banknote, Boxes, ChartNoAxesCombined, ReceiptText, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { api, rupiah } from "../api";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SalesChart = lazy(() => import("@/components/sales-chart").then((module) => ({ default: module.SalesChart })));

type Summary = { transactions: number; revenue: number; profit: number };
type TopProduct = { name: string; quantity: number; revenue: number };
type LowStock = { id: number; sku: string; name: string; stock: number; minStock: number };
type DailyReport = { day: string; transactions: number; revenue: number };
type Sale = {
  id: number;
  total: number;
  discount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  cashier: { name: string };
  items: { product: { name: string } }[];
};
type ChartDay = { day: string; transactions: number; revenue: number };
type User = { role?: string } | null;

const jakartaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

function dateRange(days: number) {
  const today = jakartaDate.format(new Date());
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startDay = start.toISOString().slice(0, 10);

  return {
    startDay,
    today,
    from: `${startDay}T00:00:00+07:00`,
    to: `${today}T23:59:59+07:00`,
  };
}

function chartDays(days: number, startDay: string, reports: DailyReport[]): ChartDay[] {
  const byDay = new Map(reports.map((report) => [report.day, report]));
  const start = new Date(`${startDay}T00:00:00Z`);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    const report = byDay.get(day);
    return { day, transactions: report?.transactions ?? 0, revenue: report?.revenue ?? 0 };
  });
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: string;
  icon: typeof ReceiptText;
  description: string;
}) {
  return (
    <Card className="flex items-start justify-between gap-3 p-5">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        <Icon className="size-5" aria-hidden="true" />
      </span>
    </Card>
  );
}

export default function Dashboard() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User;
  const canViewReports = user?.role === "ADMIN" || user?.role === "MANAJER";
  const canViewSales = canViewReports || user?.role === "KASIR";
  const [period, setPeriod] = useState<7 | 30>(7);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const chartRange = dateRange(period);
    const chartQuery = `?from=${encodeURIComponent(chartRange.from)}&to=${encodeURIComponent(chartRange.to)}`;
    const today = dateRange(1);
    const todayQuery = `?from=${encodeURIComponent(today.from)}&to=${encodeURIComponent(today.to)}`;
    const failures: string[] = [];

    const requests: Promise<void>[] = [
      api<LowStock[]>("/stock/low")
        .then(setLowStock)
        .catch((error: Error) => {
          failures.push(`Stok menipis: ${error.message}`);
        }),
    ];

    if (canViewSales) {
      requests.push(
        api<Sale[]>("/sales")
          .then(setSales)
          .catch((error: Error) => {
            failures.push(`Transaksi: ${error.message}`);
          }),
      );
    }

    if (canViewReports) {
      requests.push(
        api<Summary>("/reports/summary" + todayQuery)
          .then(setSummary)
          .catch((error: Error) => {
            failures.push(`Ringkasan: ${error.message}`);
          }),
        api<DailyReport[]>("/reports/daily" + chartQuery)
          .then(setDailyReports)
          .catch((error: Error) => {
            failures.push(`Grafik penjualan: ${error.message}`);
          }),
        api<TopProduct[]>("/reports/top-products" + todayQuery)
          .then(setTopProducts)
          .catch((error: Error) => {
            failures.push(`Produk terlaris: ${error.message}`);
          }),
      );
    }

    await Promise.all(requests);
    setErrors(failures);
    if (failures.length > 0) toast.error(failures[0]);
    setIsLoading(false);
  }, [canViewReports, canViewSales, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const dailyData = chartDays(period, dateRange(period).startDay, dailyReports);
  const recentSales = sales.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={canViewReports ? "Pantau ringkasan aktivitas dan penjualan toko." : user?.role === "KASIR" ? "Pantau stok dan transaksi penjualan Anda." : "Pantau ketersediaan stok produk toko."}
      />

      {errors.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>Beberapa data gagal dimuat: {errors.join(" · ")}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>Coba lagi</Button>
        </div>
      )}

      {canViewReports && (
        <section aria-label="Ringkasan penjualan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)
          ) : summary ? (
            <>
              <StatCard title="Transaksi" value={summary.transactions.toLocaleString("id-ID")} icon={ReceiptText} description="Transaksi selesai hari ini" />
              <StatCard title="Pendapatan" value={rupiah(summary.revenue)} icon={Banknote} description="Total penjualan hari ini" />
              <StatCard title="Laba" value={rupiah(summary.profit)} icon={TrendingUp} description="Perkiraan laba hari ini" />
            </>
          ) : (
            <Card className="p-5 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
              Ringkasan belum tersedia.
            </Card>
          )}
        </section>
      )}

      {canViewReports && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Penjualan harian</h2>
              <p className="mt-1 text-sm text-muted-foreground">Pendapatan dan jumlah transaksi per hari.</p>
            </div>
            <div className="flex rounded-lg border bg-slate-50 p-1" aria-label="Rentang grafik">
              {([7, 30] as const).map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant={period === days ? "secondary" : "ghost"}
                  aria-pressed={period === days}
                  onClick={() => setPeriod(days)}
                >
                  {days} hari
                </Button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="mt-5 h-[280px] w-full" />
          ) : errors.some((error) => error.startsWith("Grafik")) ? (
            <p className="mt-5 flex h-[280px] items-center justify-center rounded-lg bg-slate-50 text-sm text-muted-foreground">
              Grafik penjualan belum tersedia.
            </p>
          ) : (
            <Suspense fallback={<Skeleton className="mt-5 h-[280px] w-full" />}>
              <div className="mt-5">
                <SalesChart data={dailyData} />
              </div>
            </Suspense>
          )}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {canViewReports && (
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ChartNoAxesCombined className="size-5 text-indigo-600" aria-hidden="true" />
              <h2 className="font-semibold text-slate-900">Produk terlaris hari ini</h2>
            </div>
            {isLoading ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : errors.some((error) => error.startsWith("Produk terlaris")) ? (
              <p className="mt-4 text-sm text-muted-foreground">Daftar produk terlaris belum tersedia.</p>
            ) : topProducts.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Belum ada produk terjual pada periode ini.</p>
            ) : (
              <div className="mt-4 divide-y">
                {topProducts.map((product, index) => (
                  <div key={product.name} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                        {index + 1}
                      </span>
                      <span className="truncate text-sm font-medium text-slate-800">{product.name}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-900">{product.quantity.toLocaleString("id-ID")} terjual</p>
                      <p className="text-xs text-muted-foreground">{rupiah(product.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Boxes className="size-5 text-amber-600" aria-hidden="true" />
            <h2 className="font-semibold text-slate-900">Stok menipis</h2>
          </div>
          {isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : errors.some((error) => error.startsWith("Stok menipis")) ? (
            <p className="mt-4 text-sm text-muted-foreground">Data stok menipis belum tersedia.</p>
          ) : lowStock.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Semua stok aman.</p>
          ) : (
            <div className="mt-4 divide-y">
              {lowStock.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.sku}</p>
                  </div>
                  <Badge variant={item.stock <= 0 ? "destructive" : "warning"}>
                    {item.stock <= 0 ? "Habis" : `Sisa ${item.stock}`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {canViewSales && <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-5 pb-3 pt-5">
          <Activity className="size-5 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-slate-900">Transaksi terbaru</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {canViewReports ? "5 transaksi terbaru dari seluruh kasir." : "5 transaksi terbaru milik Anda."}
            </p>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-3 px-5 pb-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : errors.some((error) => error.startsWith("Transaksi")) ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Transaksi belum dapat ditampilkan.</p>
        ) : recentSales.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Belum ada transaksi pada periode ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-y bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Transaksi</th>
                  {canViewReports && <th className="px-5 py-3 font-medium">Kasir</th>}
                  <th className="px-5 py-3 font-medium">Item</th>
                  <th className="px-5 py-3 font-medium">Waktu</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-medium text-slate-800">#{sale.id}</td>
                    {canViewReports && <td className="px-5 py-3 text-slate-600">{sale.cashier.name}</td>}
                    <td className="max-w-48 truncate px-5 py-3 text-slate-600">
                      {sale.items.map((item) => item.product.name).join(", ")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                      {dateTimeFormatter.format(new Date(sale.createdAt))}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={sale.status === "COMPLETED" ? "success" : "destructive"}>
                        {sale.status === "COMPLETED" ? "Selesai" : "Dibatalkan"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-900">{rupiah(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>}
    </div>
  );
}
