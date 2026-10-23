import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Archive } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
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

type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};
type SupplierForm = { name: string; phone: string; address: string };
const emptyForm: SupplierForm = { name: "", phone: "", address: "" };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState<Supplier | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true);
    try {
      setSuppliers(await api<Supplier[]>("/suppliers"));
      setError("");
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({ name: supplier.name, phone: supplier.phone ?? "", address: supplier.address ?? "" });
    setDialogOpen(true);
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(editing ? `/suppliers/${editing.id}` : "/suppliers", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          address: form.address.trim() || undefined,
        }),
      });
      toast.success(editing ? "Pemasok berhasil diperbarui" : "Pemasok berhasil ditambahkan");
      setDialogOpen(false);
      await loadSuppliers();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveSupplier() {
    if (!archiving) return;
    setIsArchiving(true);
    try {
      await api(`/suppliers/${archiving.id}`, { method: "DELETE" });
      toast.success("Pemasok berhasil diarsipkan");
      setArchiving(null);
      await loadSuppliers();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Pemasok" description="Kelola informasi pemasok untuk kebutuhan pembelian barang." />
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>Pemasok gagal dimuat: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadSuppliers()}>Coba lagi</Button>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus className="size-4" aria-hidden="true" />Tambah pemasok</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden sm:block">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nama</TableHead><TableHead>Telepon</TableHead><TableHead>Alamat</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 4 }, (_, index) => <TableRow key={index}>{Array.from({ length: 5 }, (_, cell) => <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>)}</TableRow>)
                : suppliers.length === 0 ? <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">{error ? "Data pemasok belum dapat ditampilkan." : "Belum ada pemasok."}</TableCell></TableRow>
                  : suppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>{supplier.phone ?? "—"}</TableCell>
                      <TableCell className="max-w-64 truncate">{supplier.address ?? "—"}</TableCell>
                      <TableCell><Badge variant={supplier.isActive ? "success" : "secondary"}>{supplier.isActive ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(supplier)}><Pencil className="size-4" aria-hidden="true" />Ubah</Button>
                          {supplier.isActive && <Button variant="outline" size="sm" onClick={() => setArchiving(supplier)} aria-label={`Arsipkan ${supplier.name}`}><Archive className="size-4" aria-hidden="true" />Arsip</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {isLoading ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)
            : suppliers.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{error ? "Data pemasok belum dapat ditampilkan." : "Belum ada pemasok."}</p>
              : suppliers.map((supplier) => (
                <div key={supplier.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="font-medium">{supplier.name}</p><p className="break-all text-sm text-muted-foreground">{supplier.phone ?? "Tanpa nomor telepon"}</p></div>
                    <Badge variant={supplier.isActive ? "success" : "secondary"}>{supplier.isActive ? "Aktif" : "Nonaktif"}</Badge>
                  </div>
                  {supplier.address && <p className="mt-2 text-sm text-muted-foreground">{supplier.address}</p>}
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(supplier)}>Ubah</Button>
                    {supplier.isActive && <Button variant="outline" size="sm" onClick={() => setArchiving(supplier)}>Arsip</Button>}
                  </div>
                </div>
              ))}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={saveSupplier} className="space-y-4">
            <DialogHeader><DialogTitle>{editing ? "Ubah pemasok" : "Tambah pemasok"}</DialogTitle><DialogDescription>Isi kontak pemasok yang akan digunakan di pesanan pembelian.</DialogDescription></DialogHeader>
            <div className="space-y-2"><Label htmlFor="supplier-name">Nama pemasok</Label><Input id="supplier-name" value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
            <div className="space-y-2"><Label htmlFor="supplier-phone">Nomor telepon</Label><Input id="supplier-phone" value={form.phone} maxLength={40} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="supplier-address">Alamat</Label><textarea id="supplier-address" value={form.address} maxLength={500} onChange={(event) => setForm({ ...form, address: event.target.value })} className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={archiving !== null} onOpenChange={(open) => !open && setArchiving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Arsipkan pemasok?</DialogTitle><DialogDescription>{archiving ? `${archiving.name} tidak dapat dipilih untuk pesanan baru. Riwayat pembelian tetap disimpan.` : "Pemasok tidak dapat dipilih untuk pembelian baru."}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setArchiving(null)}>Batal</Button><Button variant="destructive" disabled={isArchiving} onClick={() => void archiveSupplier()}>{isArchiving ? "Mengarsipkan..." : "Arsipkan"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
