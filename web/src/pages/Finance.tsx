import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, rupiah } from "@/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Expense = {
  id: number;
  category: string;
  description: string | null;
  amount: number;
  incurredAt: string;
  createdBy: { id: number; name: string };
};
type ProfitLoss = {
  transactions: number;
  grossRevenue: number;
  refunds: number;
  revenue: number;
  cost: number;
  expenses: number;
  profit: number;
  expensesByCategory: { category: string; amount: number }[];
};

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

function todayInJakarta() {
  return jakartaDate.format(new Date());
}

function dateRangeQuery(from: string, to: string) {
  const query = new URLSearchParams();
  if (from) query.set("from", `${from}T00:00:00+07:00`);
  if (to) query.set("to", `${to}T23:59:59+07:00`);
  return query.toString();
}

function csvValue(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function filenameRange(from: string, to: string) {
  return `${from || "awal"}_sd_${to || "akhir"}`;
}

export default function Finance() {
  const [from, setFrom] = useState(todayInJakarta());
  const [to, setTo] = useState(todayInJakarta());
  const [appliedRange, setAppliedRange] = useState({ from: todayInJakarta(), to: todayInJakarta() });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [report, setReport] = useState<ProfitLoss | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(todayInJakarta());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const loadFinance = useCallback(async () => {
    setIsLoading(true);
    setError("");
    const query = dateRangeQuery(appliedRange.from, appliedRange.to);
    try {
      const [expenseData, reportData] = await Promise.all([
        api<Expense[]>(`/expenses?${query}`),
        api<ProfitLoss>(`/reports/profit-loss?${query}`),
      ]);
      setExpenses(expenseData);
      setReport(reportData);
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      setExpenses([]);
      setReport(null);
      toast.error(`Data keuangan gagal dimuat: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (from && to && from > to) {
      toast.error("Tanggal mulai tidak boleh melewati tanggal akhir.");
      return;
    }
    setAppliedRange({ from, to });
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      toast.error("Jumlah pengeluaran harus berupa angka rupiah positif.");
      return;
    }
    setIsSaving(true);
    try {
      await api<Expense>("/expenses", {
        method: "POST",
        body: JSON.stringify({
          category: category.trim(),
          description: description.trim() || undefined,
          amount: parsedAmount,
          incurredAt: `${incurredAt}T12:00:00+07:00`,
        }),
      });
      toast.success("Pengeluaran berhasil dicatat");
      setCategory("");
      setDescription("");
      setAmount("");
      await loadFinance();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  function exportProfitLoss() {
    if (!report) return;
    const rows: (string | number)[][] = [
      ["Laporan laba-rugi StokPintar"],
      ["Periode", appliedRange.from, appliedRange.to],
      ["Jumlah transaksi", report.transactions],
      ["Penjualan kotor", report.grossRevenue],
      ["Refund retur", report.refunds],
      ["Pendapatan bersih", report.revenue],
      ["Harga pokok penjualan bersih", report.cost],
      ["Total pengeluaran", report.expenses],
      ["Laba bersih", report.profit],
      [],
      ["Pengeluaran per kategori", "Jumlah (Rp)"],
      ...report.expensesByCategory.map((item) => [item.category, item.amount]),
    ];
    downloadCsv(`laporan-laba-rugi-${filenameRange(appliedRange.from, appliedRange.to)}.csv`, rows);
    toast.success("Laporan laba-rugi berhasil diunduh");
  }

  function exportExpenses() {
    const rows: (string | number)[][] = [
      ["Tanggal", "Kategori", "Keterangan", "Jumlah (Rp)", "Dicatat oleh"],
      ...expenses.map((expense) => [
        dateFormatter.format(new Date(expense.incurredAt)),
        expense.category,
        expense.description ?? "",
        expense.amount,
        expense.createdBy.name,
      ]),
    ];
    downloadCsv(`pengeluaran-${filenameRange(appliedRange.from, appliedRange.to)}.csv`, rows);
    toast.success("Data pengeluaran berhasil diunduh");
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Keuangan" description="Catat pengeluaran dan lihat laba-rugi bersih dalam periode pilihan." />

      <Card className="p-4">
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="finance-from">Dari tanggal</Label>
            <Input id="finance-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="finance-to">Sampai tanggal</Label>
            <Input id="finance-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <Button type="submit">Terapkan periode</Button>
          <Button type="button" variant="outline" onClick={exportProfitLoss} disabled={!report}>
            <Download className="size-4" aria-hidden="true" />Ekspor laba-rugi
          </Button>
        </form>
      </Card>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>Data keuangan gagal dimuat: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadFinance()}>Coba lagi</Button>
        </div>
      )}

      <section aria-label="Ringkasan laba-rugi" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading ? Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />) : report ? (
          <>
            <Metric label="Penjualan kotor" amount={report.grossRevenue} />
            <Metric label="Refund retur" amount={report.refunds} />
            <Metric label="Pendapatan bersih" amount={report.revenue} />
            <Metric label="HPP bersih" amount={report.cost} />
            <Metric label="Pengeluaran" amount={report.expenses} />
            <Metric label="Laba bersih" amount={report.profit} emphasized />
          </>
        ) : (
          <Card className="p-5 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">Laporan belum tersedia.</Card>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900">Catat pengeluaran</h2>
          <p className="mt-1 text-sm text-muted-foreground">Contoh: listrik, sewa, transportasi, atau perlengkapan toko.</p>
          <form onSubmit={addExpense} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="expense-category">Kategori</Label>
              <Input id="expense-category" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-description">Keterangan (opsional)</Label>
              <Input id="expense-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense-amount">Jumlah (rupiah)</Label>
                <Input id="expense-amount" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-date">Tanggal pengeluaran</Label>
                <Input id="expense-date" type="date" value={incurredAt} onChange={(event) => setIncurredAt(event.target.value)} required />
              </div>
            </div>
            <Button type="submit" disabled={isSaving}>
              <Plus className="size-4" aria-hidden="true" />{isSaving ? "Menyimpan..." : "Simpan pengeluaran"}
            </Button>
          </form>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 className="font-semibold text-slate-900">Daftar pengeluaran</h2>
              <p className="mt-1 text-sm text-muted-foreground">{appliedRange.from} sampai {appliedRange.to}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={exportExpenses} disabled={expenses.length === 0}>
              <Download className="size-4" aria-hidden="true" />Ekspor CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Kategori / keterangan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 4 }, (_, index) => (
                  <TableRow key={index}><TableCell colSpan={3}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                )) : expenses.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    {error ? "Data belum dapat ditampilkan." : "Belum ada pengeluaran pada periode ini."}
                  </TableCell></TableRow>
                ) : expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(expense.incurredAt))}</TableCell>
                    <TableCell>
                      <span className="font-medium">{expense.category}</span>
                      <span className="block max-w-56 truncate text-xs text-muted-foreground">{expense.description || "Tanpa keterangan"}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{rupiah(expense.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, amount, emphasized = false }: { label: string; amount: number; emphasized?: boolean }) {
  return (
    <Card className={`p-4 ${emphasized ? "border-indigo-200 bg-indigo-50/60" : ""}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${emphasized ? "text-indigo-700" : "text-slate-900"}`}>{rupiah(amount)}</p>
    </Card>
  );
}
