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
  returns: { quantity: number; refundAmount: number }[];
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

function returnedQuantity(item: SaleItem) {
  return item.returns.reduce((sum, returned) => sum + returned.quantity, 0);
}

export default function Transactions() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User;
  const canSeeCashier = user?.role !== "KASIR";
  const canVoidSales = user?.role === "ADMIN" || user?.role === "MANAJER";
  const canReturnSales = canVoidSales;
  const [from, setFrom] = useState(todayInJakarta());
  const [to, setTo] = useState(todayInJakarta());
  const [appliedRange, setAppliedRange] = useState({ from: todayInJakarta(), to: todayInJakarta() });
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [voidingSale, setVoidingSale] = useState<Sale | null>(null);
  const [returningSale, setReturningSale] = useState<Sale | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnQuantities, setReturnQuantities] = useState<Record<number, string>>({});
  const [isVoiding, setIsVoiding] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
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

  function openReturn(sale: Sale) {
    setSelectedSale(null);
    setReturningSale(sale);
    setReturnReason("");
    setReturnQuantities(Object.fromEntries(sale.items.map((item) => [item.id, ""])));
  }

  async function returnSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!returningSale) return;
    const requestedItems = returningSale.items.map((item) => ({
      saleItemId: item.id,
      quantity: Number(returnQuantities[item.id] || 0),
      remaining: item.quantity - returnedQuantity(item),
    }));
    if (returnReason.trim().length < 3) {
      toast.error("Alasan retur wajib diisi minimal 3 karakter.");
      return;
    }
    if (requestedItems.some((item) => !Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > item.remaining)) {
      toast.error("Jumlah retur tidak boleh melebihi sisa barang.");
      return;
    }
    const items = requestedItems
      .filter((item) => item.quantity > 0)
      .map(({ saleItemId, quantity }) => ({ saleItemId, quantity }));
    if (items.length === 0) {
      toast.error("Masukkan jumlah barang yang akan diretur.");
      return;
    }

    setIsReturning(true);
    try {
      const returned = await api<{ totalRefund: number }>(`/sales/${returningSale.id}/returns`, {
        method: "POST",
        body: JSON.stringify({ reason: returnReason.trim(), items }),
      });
      toast.success(`Retur berhasil dicatat · pengembalian ${rupiah(returned.totalRefund)}`);
      setReturningSale(null);
      await loadSales();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsReturning(false);
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
              {canSeeCashier && <TableHead>Kasir</TableHead>}
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
                  {Array.from({ length: canSeeCashier ? 7 : 6 }, (_, cell) => (
                    <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canSeeCashier ? 7 : 6} className="h-28 text-center text-muted-foreground">
                  {error ? "Data transaksi belum dapat ditampilkan." : "Belum ada transaksi pada rentang tanggal ini."}
                </TableCell>
              </TableRow>
            ) : (
              sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">#{sale.id}</TableCell>
                  <TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(sale.createdAt))} WIB</TableCell>
                  {canSeeCashier && <TableCell>{sale.cashier.name}</TableCell>}
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
                    <span>
                      {item.product.name} × {item.quantity}
                      {returnedQuantity(item) > 0 && (
                        <span className="block text-xs text-amber-700">{returnedQuantity(item)} unit sudah diretur</span>
                      )}
                    </span>
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
              {canReturnSales && selectedSale.status === "COMPLETED" && selectedSale.items.some((item) => item.quantity > returnedQuantity(item)) && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => openReturn(selectedSale)}>Retur barang</Button>
                </DialogFooter>
              )}
              {canVoidSales && selectedSale.status === "COMPLETED" && selectedSale.items.every((item) => item.returns.length === 0) && (
                <DialogFooter>
                  <Button variant="destructive" onClick={() => setVoidingSale(selectedSale)}>Batalkan transaksi</Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={returningSale !== null} onOpenChange={(open) => !open && setReturningSale(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={returnSale} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Retur transaksi #{returningSale?.id}</DialogTitle>
              <DialogDescription>Masukkan jumlah barang yang dikembalikan. Pengembalian dana memperhitungkan alokasi diskon transaksi.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {returningSale?.items.map((item) => {
                const remaining = item.quantity - returnedQuantity(item);
                if (remaining <= 0) return null;
                return (
                  <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3">
                    <Label htmlFor={`return-quantity-${item.id}`}>{item.product.name}<span className="block text-xs font-normal text-muted-foreground">Sisa yang dapat diretur: {remaining} · {rupiah(item.unitPrice)}/unit</span></Label>
                    <Input id={`return-quantity-${item.id}`} type="number" min="0" max={remaining} step="1" value={returnQuantities[item.id] ?? ""} onChange={(event) => setReturnQuantities((current) => ({ ...current, [item.id]: event.target.value }))} />
                  </div>
                );
              })}
            </div>
            <div className="space-y-2"><Label htmlFor="return-reason">Alasan retur</Label><Input id="return-reason" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} maxLength={1000} minLength={3} required /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReturningSale(null)}>Batal</Button>
              <Button type="submit" disabled={isReturning}>{isReturning ? "Menyimpan retur..." : "Simpan retur"}</Button>
            </DialogFooter>
          </form>
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
