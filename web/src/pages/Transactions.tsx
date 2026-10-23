import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, rupiah } from "@/api";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SaleItem = {
  id: number;
  quantity: number;
  unitPrice: number;
  product: { name: string };
};
type Sale = {
  id: number;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  status: "COMPLETED" | "VOIDED";
  createdAt: string;
  cashier: { name: string };
  items: SaleItem[];
};
type User = { role?: string } | null;

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});
const methodLabels: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  QRIS: "QRIS",
};

function todayInJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function Transactions() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User;
  const isAdmin = user?.role === "ADMIN";
  const [from, setFrom] = useState(todayInJakarta());
  const [to, setTo] = useState(todayInJakarta());
  const [appliedRange, setAppliedRange] = useState({ from: todayInJakarta(), to: todayInJakarta() });
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [voidingSale, setVoidingSale] = useState<Sale | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSales = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (appliedRange.from) query.set("from", `${appliedRange.from}T00:00:00+07:00`);
      if (appliedRange.to) query.set("to", `${appliedRange.to}T23:59:59+07:00`);
      setSales(await api<Sale[]>(`/sales?${query.toString()}`));
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (from && to && from > to) {
      toast.error("Tanggal mulai tidak boleh melewati tanggal akhir.");
      return;
    }
    setAppliedRange({ from, to });
  }

  async function voidSale() {
    if (!voidingSale) return;
    setIsVoiding(true);
    try {
      await api(`/sales/${voidingSale.id}/void`, { method: "POST" });
      toast.success("Transaksi berhasil dibatalkan");
      setVoidingSale(null);
      setSelectedSale(null);
      await loadSales();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsVoiding(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Riwayat transaksi" description="Lihat transaksi dan detail penjualan." />

      <Card className="p-4">
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="transactions-from">Dari tanggal</Label>
            <Input id="transactions-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transactions-to">Sampai tanggal</Label>
            <Input id="transactions-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <Button type="submit">Terapkan filter</Button>
        </form>
      </Card>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>Transaksi gagal dimuat: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadSales()}>Coba lagi</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. transaksi</TableHead>
              <TableHead>Waktu</TableHead>
              {isAdmin && <TableHead>Kasir</TableHead>}
              <TableHead>Pembayaran</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }, (_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: isAdmin ? 7 : 6 }, (_, cell) => (
                    <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} className="h-28 text-center text-muted-foreground">
                  {error ? "Data transaksi belum dapat ditampilkan." : "Belum ada transaksi pada rentang tanggal ini."}
                </TableCell>
              </TableRow>
            ) : (
              sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">#{sale.id}</TableCell>
                  <TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(sale.createdAt))} WIB</TableCell>
                  {isAdmin && <TableCell>{sale.cashier.name}</TableCell>}
                  <TableCell>{methodLabels[sale.paymentMethod] ?? sale.paymentMethod}</TableCell>
                  <TableCell>
                    <Badge variant={sale.status === "COMPLETED" ? "success" : "destructive"}>
                      {sale.status === "COMPLETED" ? "Selesai" : "Dibatalkan"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold">{rupiah(sale.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedSale(sale)}>Lihat</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={selectedSale !== null} onOpenChange={(open) => !open && setSelectedSale(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {selectedSale && (
            <>
              <DialogHeader>
                <DialogTitle>Transaksi #{selectedSale.id}</DialogTitle>
                <DialogDescription>
                  {dateFormatter.format(new Date(selectedSale.createdAt))} WIB · Kasir {selectedSale.cashier.name}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={selectedSale.status === "COMPLETED" ? "success" : "destructive"}>
                  {selectedSale.status === "COMPLETED" ? "Selesai" : "Dibatalkan"}
                </Badge>
              </div>
              <div className="divide-y border-y">
                {selectedSale.items.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3 py-3 text-sm">
                    <span>{item.product.name} × {item.quantity}</span>
                    <span className="shrink-0">{rupiah(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(selectedSale.subtotal)}</span></div>
                <div className="flex justify-between"><span>Diskon</span><span>-{rupiah(selectedSale.discount)}</span></div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{rupiah(selectedSale.total)}</span></div>
                <div className="flex justify-between"><span>Metode pembayaran</span><span>{methodLabels[selectedSale.paymentMethod] ?? selectedSale.paymentMethod}</span></div>
              </div>
              {isAdmin && selectedSale.status === "COMPLETED" && (
                <DialogFooter>
                  <Button variant="destructive" onClick={() => setVoidingSale(selectedSale)}>Batalkan transaksi</Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={voidingSale !== null} onOpenChange={(open) => !open && setVoidingSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan transaksi?</DialogTitle>
            <DialogDescription>
              {voidingSale ? `Transaksi #${voidingSale.id} akan dibatalkan dan stok barang dikembalikan.` : "Transaksi akan dibatalkan."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidingSale(null)}>Kembali</Button>
            <Button variant="destructive" onClick={() => void voidSale()} disabled={isVoiding}>
              {isVoiding ? "Membatalkan..." : "Ya, batalkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
