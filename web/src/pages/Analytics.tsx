import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, Banknote, ReceiptText, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { api, rupiah } from "@/api";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SalesChart = lazy(() => import("@/components/sales-chart").then((module) => ({ default: module.SalesChart })));

type ProfitSummary = {
  transactions: number;
  grossRevenue: number;
  refunds: number;
  revenue: number;
  cost: number;
  expenses: number;
  profit: number;
};
type AnalyticsData = {
  current: ProfitSummary;
  previous: ProfitSummary;
  changes: { transactions: number | null; revenue: number | null; profit: number | null };
  paymentMethods: { paymentMethod: string; transactions: number; revenue: number }[];
  cashiers: { cashierId: number; name: string; transactions: number; revenue: number }[];
  expensesByCategory: { category: string; amount: number }[];
  previousPeriod: { from: string; to: string };
};
type DailyReport = { day: string; transactions: number; revenue: number };
type TopProduct = { name: string; quantity: number; revenue: number };

const jakartaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
});
const paymentLabels: Record<string, string> = { CASH: "Tunai", TRANSFER: "Transfer", QRIS: "QRIS" };

function todayInJakarta() {
  return jakartaDate.format(new Date());
}

function defaultPeriod(days: 7 | 30) {
  const end = todayInJakarta();
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to: end };
}

function encodedDateQuery(from: string, to: string) {
  const fromDateTime = `${from}T00:00:00+07:00`;
  const toDateTime = `${to}T23:59:59+07:00`;
  return `?from=${encodeURIComponent(fromDateTime)}&to=${encodeURIComponent(toDateTime)}`;
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="outline">Belum ada pembanding</Badge>;
  return (
    <Badge variant={value > 0 ? "success" : value < 0 ? "destructive" : "outline"}>
      {value > 0 ? "+" : ""}{value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari periode sebelumnya
    </Badge>
  );
}

export default function Analytics() {
  const initialRange = defaultPeriod(7);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [appliedRange, setAppliedRange] = useState(initialRange);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [daily, setDaily] = useState<DailyReport[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError("");
    const query = encodedDateQuery(appliedRange.from, appliedRange.to);
    try {
      const [analytics, dailyData, topProductData] = await Promise.all([
        api<AnalyticsData>(`/reports/analytics${query}`),
        api<DailyReport[]>(`/reports/daily${query}`),
        api<TopProduct[]>(`/reports/top-products${query}`),
      ]);
      setData(analytics);
      setDaily(dailyData);
      setTopProducts(topProductData);
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      setData(null);
      setDaily([]);
      setTopProducts([]);
      toast.error(`Analitik gagal dimuat: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (from > to) {
      toast.error("Tanggal mulai tidak boleh melewati tanggal akhir.");
      return;
    }
    setAppliedRange({ from, to });
  }

  function choosePeriod(days: 7 | 30) {
    const range = defaultPeriod(days);
    setFrom(range.from);
    setTo(range.to);
    setAppliedRange(range);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Analitik" description="Bandingkan tren penjualan, laba, metode pembayaran, dan kinerja kasir." />

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => choosePeriod(7)}>7 hari</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => choosePeriod(30)}>30 hari</Button>
        </div>
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="analytics-from">Dari tanggal</Label>
            <Input id="analytics-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="analytics-to">Sampai tanggal</Label>
            <Input id="analytics-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} required />
          </div>
          <Button type="submit">Terapkan periode</Button>
        </form>
      </Card>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>Analitik gagal dimuat: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadAnalytics()}>Coba lagi</Button>
        </div>
      )}

      <section aria-label="Ringkasan analitik" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32 rounded-xl" />) : data ? (
          <>
            <InsightCard label="Transaksi selesai" value={data.current.transactions.toLocaleString("id-ID")} change={data.changes.transactions} icon={ReceiptText} />
            <InsightCard label="Pendapatan bersih" value={rupiah(data.current.revenue)} change={data.changes.revenue} icon={Banknote} />
            <InsightCard label="Laba bersih" value={rupiah(data.current.profit)} change={data.changes.profit} icon={TrendingUp} />
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Pengeluaran</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{rupiah(data.current.expenses)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{data.current.refunds.toLocaleString("id-ID")} refund telah diperhitungkan</p>
            </Card>
          </>
        ) : (
          <Card className="p-5 text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">Data analitik belum tersedia.</Card>
        )}
      </section>

      <Card className="p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">Tren harian</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dibandingkan dengan periode sebelumnya: {data ? `${dateFormatter.format(new Date(data.previousPeriod.from))} – ${dateFormatter.format(new Date(data.previousPeriod.to))}` : "—"}
          </p>
        </div>
        {isLoading ? <Skeleton className="h-[280px] w-full" /> : (
          <Suspense fallback={<Skeleton className="h-[280px] w-full" />}>
            <SalesChart data={daily} />
          </Suspense>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <BreakdownCard
          title="Metode pembayaran"
          description="Pendapatan bersih dan jumlah transaksi per metode."
          loading={isLoading}
          empty={!data || data.paymentMethods.length === 0}
          rows={data?.paymentMethods.map((item) => ({
            label: paymentLabels[item.paymentMethod] ?? item.paymentMethod,
            amount: item.revenue,
            detail: `${item.transactions.toLocaleString("id-ID")} transaksi`,
          })) ?? []}
        />
        <BreakdownCard
          title="Pengeluaran per kategori"
          description="Rincian biaya toko pada periode yang dipilih."
          loading={isLoading}
          empty={!data || data.expensesByCategory.length === 0}
          rows={data?.expensesByCategory.map((item) => ({ label: item.category, amount: item.amount })) ?? []}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="p-5">
            <h2 className="font-semibold text-slate-900">Kinerja kasir</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pendapatan bersih transaksi per kasir.</p>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Kasir</TableHead><TableHead className="text-right">Transaksi</TableHead><TableHead className="text-right">Pendapatan bersih</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={3}><Skeleton className="h-6 w-full" /></TableCell></TableRow> : !data || data.cashiers.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">Belum ada transaksi pada periode ini.</TableCell></TableRow>
              ) : data.cashiers.map((cashier) => (
                <TableRow key={cashier.cashierId}>
                  <TableCell className="font-medium">{cashier.name}</TableCell>
                  <TableCell className="text-right">{cashier.transactions.toLocaleString("id-ID")}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{rupiah(cashier.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-5">
            <h2 className="font-semibold text-slate-900">Produk terlaris</h2>
            <p className="mt-1 text-sm text-muted-foreground">Jumlah terjual dan pendapatan setelah retur.</p>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead className="text-right">Terjual bersih</TableHead><TableHead className="text-right">Pendapatan</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={3}><Skeleton className="h-6 w-full" /></TableCell></TableRow> : topProducts.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">Belum ada produk terjual pada periode ini.</TableCell></TableRow>
              ) : topProducts.map((product) => (
                <TableRow key={product.name}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-right">{product.quantity.toLocaleString("id-ID")}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{rupiah(product.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {data && (
        <Card className="flex flex-wrap items-center gap-2 p-4 text-sm text-muted-foreground">
          <Activity className="size-4" aria-hidden="true" />
          Angka periode saat ini dibandingkan dengan durasi yang sama sebelumnya.
          <span className="ml-auto">Periode sebelumnya: {data.previous.transactions.toLocaleString("id-ID")} transaksi · laba {rupiah(data.previous.profit)}</span>
        </Card>
      )}
    </div>
  );
}

function InsightCard({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  change: number | null;
  icon: typeof ReceiptText;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-indigo-600" aria-hidden="true" />
      </div>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
      <div className="mt-2"><ChangeBadge value={change} /></div>
    </Card>
  );
}

function BreakdownCard({
  title,
  description,
  loading,
  empty,
  rows,
}: {
  title: string;
  description: string;
  loading: boolean;
  empty: boolean;
  rows: { label: string; amount: number; detail?: string }[];
}) {
  const maximum = Math.max(...rows.map((row) => row.amount), 0);
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {loading ? <div className="mt-5 space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-4/5" /><Skeleton className="h-8 w-3/5" /></div> : empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data untuk periode ini.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {rows.map((row) => (
            <div key={row.label} className="space-y-1.5">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium text-slate-800">{row.label}{row.detail ? <span className="ml-2 text-xs font-normal text-muted-foreground">{row.detail}</span> : null}</span>
                <span className="whitespace-nowrap text-slate-600">{rupiah(row.amount)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${maximum > 0 ? Math.max((row.amount / maximum) * 100, 2) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
