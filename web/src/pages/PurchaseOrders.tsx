import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Eye, Plus, Send, PackageCheck, Ban, Pencil, Trash2 } from "lucide-react";
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
type Status = "DRAFT" | "ORDERED" | "PARTIAL" | "RECEIVED" | "CANCELLED";
type Supplier = { id: number; name: string; isActive: boolean };
type Product = { id: number; sku: string; name: string; costPrice: number; stock: number };
type OrderItem = {
  id: number;
  productId: number;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  product: { id: number; sku: string; name: string; costPrice: number };
};
type Receipt = {
  id: number;
  note: string | null;
  createdAt: string;
  createdBy: { name: string };
  items: { id: number; purchaseOrderItemId: number; quantity: number }[];
};
type PurchaseOrder = {
  id: number;
  orderNumber: string;
  status: Status;
  notes: string | null;
  createdAt: string;
  orderedAt: string | null;
  supplier: { id: number; name: string };
  createdBy: { id: number; name: string };
  items: OrderItem[];
  receipts: Receipt[];
};
type DraftLine = { key: string; productId: string; qtyOrdered: string; unitCost: string };

const statusLabels: Record<Status, string> = {
  DRAFT: "Draf",
  ORDERED: "Dipesan",
  PARTIAL: "Diterima sebagian",
  RECEIVED: "Diterima penuh",
  CANCELLED: "Dibatalkan",
};
const statusVariants: Record<Status, "secondary" | "default" | "warning" | "success" | "destructive"> = {
  DRAFT: "secondary",
  ORDERED: "default",
  PARTIAL: "warning",
  RECEIVED: "success",
  CANCELLED: "destructive",
};
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});
const emptyLine = (): DraftLine => ({ key: crypto.randomUUID(), productId: "", qtyOrdered: "1", unitCost: "" });

function orderTotal(items: Pick<OrderItem, "qtyOrdered" | "unitCost">[]) {
  return items.reduce((total, item) => total + item.qtyOrdered * item.unitCost, 0);
}

export default function PurchaseOrders() {
  const currentUser = JSON.parse(localStorage.getItem("user") ?? "null") as { role?: Role } | null;
  const canManageOrders = currentUser?.role === "ADMIN" || currentUser?.role === "MANAJER";
  const canReceive = currentUser?.role === "ADMIN" || currentUser?.role === "GUDANG";
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, string>>({});
  const [receiveNote, setReceiveNote] = useState("");
  const [isReceiving, setIsReceiving] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<PurchaseOrder | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isOrdering, setIsOrdering] = useState<number | null>(null);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      setOrders(await api<PurchaseOrder[]>(`/purchase-orders${query}`));
      setError("");
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [supplierData, productData] = await Promise.all([
        api<Supplier[]>("/suppliers"),
        api<Product[]>("/products"),
      ]);
      setSuppliers(supplierData);
      setProducts(productData);
    } catch (requestError) {
      toast.error(`Data pemasok atau produk gagal dimuat: ${(requestError as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  function openCreate() {
    setEditing(null);
    setSupplierId("");
    setNotes("");
    setLines([emptyLine()]);
    setDialogOpen(true);
  }

  function openEdit(order: PurchaseOrder) {
    setEditing(order);
    setSupplierId(String(order.supplier.id));
    setNotes(order.notes ?? "");
    setLines(order.items.map((item) => ({
      key: crypto.randomUUID(),
      productId: String(item.productId),
      qtyOrdered: String(item.qtyOrdered),
      unitCost: String(item.unitCost),
    })));
    setDialogOpen(true);
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) {
      toast.error("Pilih pemasok untuk pesanan.");
      return;
    }
    const items = lines.map((line) => ({
      productId: Number(line.productId),
      qtyOrdered: Number(line.qtyOrdered),
      unitCost: Number(line.unitCost),
    }));
    if (items.some((item) => !Number.isInteger(item.productId) || item.productId <= 0 || !Number.isInteger(item.qtyOrdered) || item.qtyOrdered <= 0 || !Number.isInteger(item.unitCost) || item.unitCost < 0)) {
      toast.error("Periksa produk, jumlah, dan modal pada setiap baris.");
      return;
    }
    if (new Set(items.map((item) => item.productId)).size !== items.length) {
      toast.error("Produk yang sama hanya boleh ditambahkan satu kali.");
      return;
    }

    setIsSaving(true);
    try {
      await api(editing ? `/purchase-orders/${editing.id}` : "/purchase-orders", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          supplierId: Number(supplierId),
          notes: editing ? notes.trim() || null : notes.trim() || undefined,
          items,
        }),
      });
      toast.success(editing ? "Draf pesanan berhasil diperbarui" : "Pesanan pembelian berhasil dibuat");
      setDialogOpen(false);
      await loadOrders();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function openDetail(order: PurchaseOrder) {
    setIsLoadingDetail(true);
    setSelectedOrder(order);
    try {
      setSelectedOrder(await api<PurchaseOrder>(`/purchase-orders/${order.id}`));
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function orderPurchase(order: PurchaseOrder) {
    setIsOrdering(order.id);
    try {
      await api(`/purchase-orders/${order.id}/order`, { method: "POST" });
      toast.success(`${order.orderNumber} berhasil dikirim`);
      await loadOrders();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsOrdering(null);
    }
  }

  function openReceive(order: PurchaseOrder) {
    setReceivingOrder(order);
    setReceiveNote("");
    setReceiveQuantities(Object.fromEntries(order.items.map((item) => [item.id, ""])));
  }

  async function receiveItems(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receivingOrder) return;
    const items = receivingOrder.items
      .map((item) => ({ purchaseOrderItemId: item.id, quantity: Number(receiveQuantities[item.id] || 0) }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0 || items.some((item) => !Number.isInteger(item.quantity))) {
      toast.error("Masukkan jumlah barang yang diterima, minimal satu baris.");
      return;
    }

    setIsReceiving(true);
    try {
      await api(`/purchase-orders/${receivingOrder.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ items, note: receiveNote.trim() || undefined }),
      });
      toast.success("Penerimaan barang berhasil dicatat");
      setReceivingOrder(null);
      setSelectedOrder(null);
      await loadOrders();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsReceiving(false);
    }
  }

  async function cancelOrder() {
    if (!cancellingOrder) return;
    setIsCancelling(true);
    try {
      await api(`/purchase-orders/${cancellingOrder.id}/cancel`, { method: "POST" });
      toast.success("Pesanan pembelian berhasil dibatalkan");
      setCancellingOrder(null);
      await loadOrders();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Pembelian" description="Buat pesanan pemasok dan catat penerimaan barang ke stok." />
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-2 sm:max-w-xs">
          <Label htmlFor="purchase-status">Status pesanan</Label>
          <select id="purchase-status" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Semua status</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {canManageOrders && <Button onClick={openCreate} disabled={suppliers.filter((supplier) => supplier.isActive).length === 0 || products.length === 0}><Plus className="size-4" aria-hidden="true" />Buat pesanan</Button>}
      </Card>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>Pesanan gagal dimuat: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadOrders()}>Coba lagi</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="hidden sm:block">
          <Table>
            <TableHeader><TableRow>
              <TableHead>No. pesanan</TableHead><TableHead>Tanggal</TableHead><TableHead>Pemasok</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }, (_, index) => <TableRow key={index}>{Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>)}</TableRow>)
                : orders.length === 0 ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{error ? "Daftar pesanan belum dapat ditampilkan." : "Belum ada pesanan pembelian."}</TableCell></TableRow>
                  : orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(order.createdAt))} WIB</TableCell>
                      <TableCell>{order.supplier.name}</TableCell>
                      <TableCell><Badge variant={statusVariants[order.status]}>{statusLabels[order.status]}</Badge></TableCell>
                      <TableCell className="text-right">{rupiah(orderTotal(order.items))}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => void openDetail(order)} aria-label={`Detail ${order.orderNumber}`}><Eye className="size-4" aria-hidden="true" />Detail</Button>
                          {canManageOrders && order.status === "DRAFT" && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(order)} aria-label={`Ubah ${order.orderNumber}`}><Pencil className="size-4" aria-hidden="true" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => void orderPurchase(order)} disabled={isOrdering === order.id} aria-label={`Kirim ${order.orderNumber}`}><Send className="size-4" aria-hidden="true" /></Button>
                            </>
                          )}
                          {canReceive && (order.status === "ORDERED" || order.status === "PARTIAL") && <Button variant="ghost" size="sm" onClick={() => openReceive(order)} aria-label={`Terima barang ${order.orderNumber}`}><PackageCheck className="size-4" aria-hidden="true" />Terima</Button>}
                          {canManageOrders && (order.status === "DRAFT" || order.status === "ORDERED") && <Button variant="ghost" size="sm" onClick={() => setCancellingOrder(order)} aria-label={`Batalkan ${order.orderNumber}`}><Ban className="size-4 text-red-600" aria-hidden="true" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {isLoading ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 rounded-lg" />)
            : orders.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{error ? "Daftar pesanan belum dapat ditampilkan." : "Belum ada pesanan pembelian."}</p>
              : orders.map((order) => (
                <div key={order.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-medium">{order.orderNumber}</p><p className="mt-1 text-sm text-muted-foreground">{order.supplier.name}</p></div>
                    <Badge variant={statusVariants[order.status]}>{statusLabels[order.status]}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm"><span className="text-muted-foreground">{dateFormatter.format(new Date(order.createdAt))} WIB</span><span className="font-semibold">{rupiah(orderTotal(order.items))}</span></div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => void openDetail(order)}>Detail</Button>
                    {canManageOrders && order.status === "DRAFT" && <><Button variant="outline" size="sm" onClick={() => openEdit(order)}>Ubah</Button><Button variant="outline" size="sm" onClick={() => void orderPurchase(order)} disabled={isOrdering === order.id}>Kirim</Button></>}
                    {canReceive && (order.status === "ORDERED" || order.status === "PARTIAL") && <Button variant="outline" size="sm" onClick={() => openReceive(order)}>Terima barang</Button>}
                    {canManageOrders && (order.status === "DRAFT" || order.status === "ORDERED") && <Button variant="outline" size="sm" onClick={() => setCancellingOrder(order)}><Trash2 className="size-4" aria-hidden="true" />Batalkan</Button>}
                  </div>
                </div>
              ))}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <form onSubmit={saveOrder} className="space-y-5">
            <DialogHeader><DialogTitle>{editing ? `Ubah ${editing.orderNumber}` : "Buat pesanan pembelian"}</DialogTitle><DialogDescription>Pesanan draf dapat diubah sebelum dikirim ke pemasok.</DialogDescription></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="purchase-supplier">Pemasok</Label><select id="purchase-supplier" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required><option value="">Pilih pemasok</option>{suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
              <div className="space-y-2"><Label htmlFor="purchase-notes">Catatan</Label><Input id="purchase-notes" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opsional" /></div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><h3 className="font-medium">Barang pesanan</h3><Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyLine()])}><Plus className="size-4" aria-hidden="true" />Tambah baris</Button></div>
              {lines.map((line, index) => (
                <div key={line.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] sm:items-end">
                  <div className="space-y-2"><Label htmlFor={`order-product-${line.key}`}>Produk {index + 1}</Label><select id={`order-product-${line.key}`} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={line.productId} onChange={(event) => {
                    const product = products.find((item) => item.id === Number(event.target.value));
                    setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, productId: event.target.value, unitCost: product ? String(product.costPrice) : "" } : entry));
                  }} required><option value="">Pilih produk</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select></div>
                  <div className="space-y-2"><Label htmlFor={`order-qty-${line.key}`}>Jumlah</Label><Input id={`order-qty-${line.key}`} type="number" min="1" step="1" value={line.qtyOrdered} onChange={(event) => setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, qtyOrdered: event.target.value } : entry))} required /></div>
                  <div className="space-y-2"><Label htmlFor={`order-cost-${line.key}`}>Modal per unit</Label><Input id={`order-cost-${line.key}`} type="number" min="0" step="1" value={line.unitCost} onChange={(event) => setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, unitCost: event.target.value } : entry))} required /></div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Hapus baris produk ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}><Trash2 className="size-4 text-red-600" aria-hidden="true" /></Button>
                </div>
              ))}
              <div className="flex justify-end gap-2 border-t pt-3 text-sm"><span className="text-muted-foreground">Perkiraan total modal</span><span className="font-semibold">{rupiah(lines.reduce((total, line) => total + Number(line.qtyOrdered || 0) * Number(line.unitCost || 0), 0))}</span></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button type="submit" disabled={isSaving}>{isSaving ? "Menyimpan..." : editing ? "Simpan draf" : "Buat draf"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedOrder !== null} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selectedOrder && (
            <>
              <DialogHeader><DialogTitle>{selectedOrder.orderNumber}</DialogTitle><DialogDescription>{selectedOrder.supplier.name} · dibuat oleh {selectedOrder.createdBy.name} · {dateFormatter.format(new Date(selectedOrder.createdAt))} WIB</DialogDescription></DialogHeader>
              {isLoadingDetail ? <Skeleton className="h-32 w-full" /> : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Status</span><Badge variant={statusVariants[selectedOrder.status]}>{statusLabels[selectedOrder.status]}</Badge></div>
                  <div className="space-y-2">{selectedOrder.items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{item.product.name} · {item.qtyReceived}/{item.qtyOrdered} unit diterima</span><span className="shrink-0">{rupiah(item.qtyOrdered * item.unitCost)}</span></div>)}</div>
                  <div className="flex justify-between font-semibold"><span>Total</span><span>{rupiah(orderTotal(selectedOrder.items))}</span></div>
                  {selectedOrder.notes && <p className="text-sm text-muted-foreground">Catatan: {selectedOrder.notes}</p>}
                  <div><h3 className="mb-2 font-medium">Riwayat penerimaan</h3>{selectedOrder.receipts.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada barang diterima.</p> : <div className="space-y-2">{selectedOrder.receipts.map((receipt) => <div key={receipt.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{dateFormatter.format(new Date(receipt.createdAt))} WIB · {receipt.createdBy.name}</p><p className="mt-1 text-muted-foreground">{receipt.items.reduce((sum, item) => sum + item.quantity, 0)} unit diterima{receipt.note ? ` · ${receipt.note}` : ""}</p></div>)}</div>}</div>
                </div>
              )}
              {canReceive && (selectedOrder.status === "ORDERED" || selectedOrder.status === "PARTIAL") && <DialogFooter><Button onClick={() => { setSelectedOrder(null); openReceive(selectedOrder); }}><PackageCheck className="size-4" aria-hidden="true" />Terima barang</Button></DialogFooter>}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={receivingOrder !== null} onOpenChange={(open) => !open && setReceivingOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={receiveItems} className="space-y-5">
            <DialogHeader><DialogTitle>Terima barang</DialogTitle><DialogDescription>{receivingOrder?.orderNumber} · masukkan jumlah yang benar-benar diterima.</DialogDescription></DialogHeader>
            <div className="space-y-3">{receivingOrder?.items.map((item) => {
              const remaining = item.qtyOrdered - item.qtyReceived;
              return <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3"><Label htmlFor={`receive-${item.id}`}>{item.product.name}<span className="block text-xs font-normal text-muted-foreground">Sisa pesanan {remaining}</span></Label><Input id={`receive-${item.id}`} type="number" min="0" max={remaining} step="1" value={receiveQuantities[item.id] ?? ""} onChange={(event) => setReceiveQuantities((current) => ({ ...current, [item.id]: event.target.value }))} /></div>;
            })}</div>
            <div className="space-y-2"><Label htmlFor="receipt-note">Catatan penerimaan</Label><Input id="receipt-note" value={receiveNote} onChange={(event) => setReceiveNote(event.target.value)} maxLength={1000} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setReceivingOrder(null)}>Batal</Button><Button type="submit" disabled={isReceiving}>{isReceiving ? "Menyimpan..." : "Catat penerimaan"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cancellingOrder !== null} onOpenChange={(open) => !open && setCancellingOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Batalkan pesanan?</DialogTitle><DialogDescription>{cancellingOrder ? `${cancellingOrder.orderNumber} akan ditandai dibatalkan. Riwayat pesanan tetap disimpan.` : "Pesanan akan dibatalkan."}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setCancellingOrder(null)}>Kembali</Button><Button variant="destructive" onClick={() => void cancelOrder()} disabled={isCancelling}>{isCancelling ? "Membatalkan..." : "Batalkan pesanan"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
