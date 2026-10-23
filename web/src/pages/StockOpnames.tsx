import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Scale } from "lucide-react";
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

type Role = "ADMIN" | "MANAJER" | "GUDANG" | "KASIR";
type Status = "DRAFT" | "FINALIZED";
type Category = { id: number; name: string };
type OpnameItem = {
  id: number;
  productId: number;
  systemQty: number;
  countedQty: number | null;
  difference: number | null;
  unitCostAtOpen: number;
  product: { id: number; sku: string; name: string; costPrice: number };
};
type Opname = {
  id: number;
  opnameNumber: string;
  status: Status;
  notes: string | null;
  categoryId: number | null;
  category: Category | null;
  createdAt: string;
  finalizedAt: string | null;
  createdBy: { id: number; name: string };
  items: OpnameItem[];
};
type Warning = { productId: number; productName: string; snapshotQty: number; currentQty: number; countedQty: number };

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

function differenceClass(difference: number) {
  return difference > 0 ? "font-semibold text-emerald-700" : difference < 0 ? "font-semibold text-red-700" : "text-slate-600";
}

export default function StockOpnames() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as { role?: Role } | null;
  const canFinalize = user?.role === "ADMIN" || user?.role === "MANAJER";
  const [opnames, setOpnames] = useState<Opname[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingOpname, setEditingOpname] = useState<Opname | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSavingCounts, setIsSavingCounts] = useState(false);
  const [finalizing, setFinalizing] = useState<Opname | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [warnings, setWarnings] = useState<Warning[] | null>(null);

  const loadOpnames = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      setOpnames(await api<Opname[]>(`/stock-opnames${query}`));
      setError("");
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadOpnames();
  }, [loadOpnames]);

  useEffect(() => {
    api<Category[]>("/categories")
      .then(setCategories)
      .catch((requestError: Error) => toast.error(`Kategori gagal dimuat: ${requestError.message}`));
  }, []);

  async function createOpname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    try {
      const created = await api<Opname>("/stock-opnames", {
        method: "POST",
        body: JSON.stringify({ categoryId: categoryId ? Number(categoryId) : undefined, notes: notes.trim() || undefined }),
      });
      toast.success(`Snapshot ${created.opnameNumber} dibuat dengan ${created.items.length} produk`);
      setCreateOpen(false);
      setCategoryId("");
      setNotes("");
      await loadOpnames();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsCreating(false);
    }
  }

  async function openCount(opname: Opname) {
    setIsLoadingDetail(true);
    try {
      const detail = await api<Opname>(`/stock-opnames/${opname.id}`);
      setEditingOpname(detail);
      setCounts(Object.fromEntries(detail.items.map((item) => [item.productId, item.countedQty === null ? "" : String(item.countedQty)])));
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  const countItems = editingOpname?.items.filter((item) => counts[item.productId] !== "") ?? [];
  const totalDifferenceValue = countItems.reduce((total, item) => {
    const difference = editingOpname?.status === "FINALIZED"
      ? item.difference ?? 0
      : Number(counts[item.productId]) - item.systemQty;
    return total + difference * item.unitCostAtOpen;
  }, 0);

  async function saveCounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOpname) return;
    const items = countItems.map((item) => ({ productId: item.productId, countedQty: Number(counts[item.productId]) }));
    if (items.length === 0 || items.some((item) => !Number.isInteger(item.countedQty) || item.countedQty < 0)) {
      toast.error("Isi jumlah fisik minimal satu produk dengan angka nol atau lebih.");
      return;
    }
    setIsSavingCounts(true);
    try {
      const updated = await api<Opname>(`/stock-opnames/${editingOpname.id}/items`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
      setEditingOpname(updated);
      setCounts(Object.fromEntries(updated.items.map((item) => [item.productId, item.countedQty === null ? "" : String(item.countedQty)])));
      toast.success("Hitungan fisik berhasil disimpan");
      await loadOpnames();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsSavingCounts(false);
    }
  }

  async function finalizeOpname() {
    if (!finalizing) return;
    setIsFinalizing(true);
    try {
      const result = await api<{ opname: Opname; warnings: Warning[] }>(`/stock-opnames/${finalizing.id}/finalize`, { method: "POST" });
      setFinalizing(null);
      setEditingOpname(null);
      await loadOpnames();
      if (result.warnings.length > 0) setWarnings(result.warnings);
      else toast.success(`${result.opname.opnameNumber} berhasil difinalisasi`);
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Stok opname" description="Bandingkan stok sistem dengan hasil hitung fisik sebelum memperbarui saldo." />
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-2 sm:max-w-xs">
          <Label htmlFor="opname-status">Status opname</Label>
          <select id="opname-status" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Semua status</option><option value="DRAFT">Draf</option><option value="FINALIZED">Final</option>
          </select>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />Buat opname</Button>
      </Card>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>Opname gagal dimuat: {error}</span><Button variant="outline" size="sm" onClick={() => void loadOpnames()}>Coba lagi</Button></div>}

      <Card className="overflow-hidden">
        <div className="hidden sm:block">
          <Table>
            <TableHeader><TableRow><TableHead>No. opname</TableHead><TableHead>Waktu</TableHead><TableHead>Kategori</TableHead><TableHead>Dibuat oleh</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }, (_, index) => <TableRow key={index}>{Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>)}</TableRow>)
                : opnames.length === 0 ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{error ? "Data opname belum dapat ditampilkan." : "Belum ada stok opname."}</TableCell></TableRow>
                  : opnames.map((opname) => (
                    <TableRow key={opname.id}>
                      <TableCell className="font-medium">{opname.opnameNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(opname.createdAt))} WIB</TableCell>
                      <TableCell>{opname.category?.name ?? "Semua produk aktif"}</TableCell>
                      <TableCell>{opname.createdBy.name}</TableCell>
                      <TableCell><Badge variant={opname.status === "DRAFT" ? "warning" : "success"}>{opname.status === "DRAFT" ? "Draf" : "Final"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => void openCount(opname)} disabled={isLoadingDetail}>{opname.status === "DRAFT" ? "Isi hitungan" : "Lihat"}</Button>
                          {canFinalize && opname.status === "DRAFT" && <Button size="sm" onClick={() => setFinalizing(opname)}>Finalisasi</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {isLoading ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 rounded-lg" />)
            : opnames.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{error ? "Data opname belum dapat ditampilkan." : "Belum ada stok opname."}</p>
              : opnames.map((opname) => (
                <div key={opname.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{opname.opnameNumber}</p><p className="mt-1 text-sm text-muted-foreground">{opname.category?.name ?? "Semua produk aktif"}</p></div><Badge variant={opname.status === "DRAFT" ? "warning" : "success"}>{opname.status === "DRAFT" ? "Draf" : "Final"}</Badge></div>
                  <p className="mt-2 text-xs text-muted-foreground">{dateFormatter.format(new Date(opname.createdAt))} WIB · {opname.createdBy.name}</p>
                  <div className="mt-3 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => void openCount(opname)}>{opname.status === "DRAFT" ? "Isi hitungan" : "Lihat"}</Button>{canFinalize && opname.status === "DRAFT" && <Button size="sm" onClick={() => setFinalizing(opname)}>Finalisasi</Button>}</div>
                </div>
              ))}
        </div>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={createOpname} className="space-y-5">
            <DialogHeader><DialogTitle>Buat snapshot opname</DialogTitle><DialogDescription>Sistem menyimpan saldo ledger dan modal produk aktif saat ini.</DialogDescription></DialogHeader>
            <div className="space-y-2"><Label htmlFor="opname-category">Kategori produk</Label><select id="opname-category" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Semua produk aktif</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="opname-notes">Catatan</Label><Input id="opname-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button><Button type="submit" disabled={isCreating}>{isCreating ? "Membuat..." : "Buat snapshot"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingOpname !== null || isLoadingDetail} onOpenChange={(open) => !open && setEditingOpname(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <form onSubmit={saveCounts} className="space-y-4">
            <DialogHeader><DialogTitle>{editingOpname?.opnameNumber ?? "Memuat opname..."}</DialogTitle><DialogDescription>{editingOpname?.status === "DRAFT" ? "Masukkan jumlah fisik tiap produk. Produk dapat dihitung bertahap." : "Rincian snapshot dan hasil final."}</DialogDescription></DialogHeader>
            {isLoadingDetail ? <Skeleton className="h-48 w-full" /> : editingOpname && (
              <>
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead className="text-right">Stok snapshot</TableHead><TableHead className="text-right">Hitung fisik</TableHead><TableHead className="text-right">Selisih</TableHead><TableHead className="text-right">Nilai selisih</TableHead></TableRow></TableHeader>
                    <TableBody>{editingOpname.items.map((item) => {
                      const countedValue = counts[item.productId] ?? "";
                      const difference = editingOpname.status === "FINALIZED" ? item.difference : countedValue === "" ? null : Number(countedValue) - item.systemQty;
                      return <TableRow key={item.id}><TableCell><span className="font-medium">{item.product.name}</span><span className="block text-xs text-muted-foreground">{item.product.sku}</span></TableCell><TableCell className="text-right">{item.systemQty}</TableCell><TableCell className="w-36"><Input aria-label={`Hitung fisik ${item.product.name}`} type="number" min="0" step="1" value={countedValue} disabled={editingOpname.status !== "DRAFT"} onChange={(event) => setCounts((current) => ({ ...current, [item.productId]: event.target.value }))} /></TableCell><TableCell className={`text-right ${difference === null ? "text-muted-foreground" : differenceClass(difference)}`}>{difference === null ? "—" : difference > 0 ? `+${difference}` : difference}</TableCell><TableCell className="text-right">{difference === null ? "—" : rupiah(difference * item.unitCostAtOpen)}</TableCell></TableRow>;
                    })}</TableBody>
                  </Table>
                </div>
                <div className="space-y-3 sm:hidden">{editingOpname.items.map((item) => {
                  const countedValue = counts[item.productId] ?? "";
                  const difference = editingOpname.status === "FINALIZED" ? item.difference : countedValue === "" ? null : Number(countedValue) - item.systemQty;
                  return <div key={item.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><div><p className="font-medium">{item.product.name}</p><p className="text-xs text-muted-foreground">{item.product.sku} · snapshot {item.systemQty}</p></div><span className={`text-sm ${difference === null ? "text-muted-foreground" : differenceClass(difference)}`}>{difference === null ? "—" : difference > 0 ? `+${difference}` : difference}</span></div><div className="mt-3 grid grid-cols-2 items-end gap-3"><div className="space-y-1"><Label htmlFor={`opname-count-${item.id}`}>Hitung fisik</Label><Input id={`opname-count-${item.id}`} type="number" min="0" step="1" value={countedValue} disabled={editingOpname.status !== "DRAFT"} onChange={(event) => setCounts((current) => ({ ...current, [item.productId]: event.target.value }))} /></div><p className="text-right text-sm text-muted-foreground">{difference === null ? "Nilai —" : rupiah(difference * item.unitCostAtOpen)}</p></div></div>;
                })}</div>
                <div className="flex items-start gap-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900"><Scale className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{editingOpname.status === "DRAFT" ? "Perkiraan nilai selisih terhadap snapshot" : "Nilai selisih yang dicatat saat finalisasi"}: <strong>{rupiah(totalDifferenceValue)}</strong>. Nilai ini memakai modal yang disimpan saat opname dibuat.</span></div>
                {editingOpname.status === "DRAFT" && <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingOpname(null)}>Tutup</Button><Button type="submit" disabled={isSavingCounts}>{isSavingCounts ? "Menyimpan..." : "Simpan hitungan"}</Button></DialogFooter>}
              </>
            )}
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={finalizing !== null} onOpenChange={(open) => !open && setFinalizing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Finalisasi opname?</DialogTitle><DialogDescription>{finalizing ? `Sistem menghitung ulang selisih ${finalizing.opnameNumber} terhadap stok terkini, lalu mencatat perubahan ke ledger. Semua produk wajib sudah dihitung.` : "Perubahan stok opname akan dicatat ke ledger."}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setFinalizing(null)}>Kembali</Button><Button onClick={() => void finalizeOpname()} disabled={isFinalizing}>{isFinalizing ? "Memfinalisasi..." : "Finalisasi"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={warnings !== null} onOpenChange={(open) => !open && setWarnings(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Stok berubah sejak snapshot</DialogTitle><DialogDescription>Perubahan berikut dihitung terhadap stok terkini saat finalisasi, bukan angka snapshot.</DialogDescription></DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">{warnings?.map((warning) => <div key={warning.productId} className="rounded-lg border p-3 text-sm"><p className="font-medium">{warning.productName}</p><p className="text-muted-foreground">Snapshot {warning.snapshotQty} · sistem sekarang {warning.currentQty} · fisik {warning.countedQty}</p></div>)}</div>
          <DialogFooter><Button onClick={() => setWarnings(null)}>Mengerti</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
