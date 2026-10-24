import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AuditUser = { id: number; name: string; email: string };
type AuditEntry = {
  id: number;
  userId: number;
  action: string;
  entity: string;
  entityId: number | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
  user: AuditUser;
};
type AuditPage = {
  data: AuditEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
type Account = AuditUser & { role: string; isActive: boolean };
type Filters = { userId: string; entity: string; from: string; to: string };

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

const entityLabels: Record<string, string> = {
  User: "Akun",
  Product: "Produk",
  StockMovement: "Perubahan stok",
  Sale: "Transaksi",
  Category: "Kategori",
  Supplier: "Pemasok",
  PurchaseOrder: "Pesanan pembelian",
  StockOpname: "Stok opname",
  SaleReturn: "Retur penjualan",
};

export default function AuditLogs() {
  const [users, setUsers] = useState<Account[]>([]);
  const [filters, setFilters] = useState<Filters>({ userId: "", entity: "", from: "", to: "" });
  const [appliedFilters, setAppliedFilters] = useState<Filters>(filters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), limit: "25" });
      if (appliedFilters.userId) query.set("userId", appliedFilters.userId);
      if (appliedFilters.entity) query.set("entity", appliedFilters.entity);
      if (appliedFilters.from) query.set("from", `${appliedFilters.from}T00:00:00+07:00`);
      if (appliedFilters.to) query.set("to", `${appliedFilters.to}T23:59:59+07:00`);
      setResult(await api<AuditPage>(`/audit-logs?${query.toString()}`));
      setError("");
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  useEffect(() => {
    api<Account[]>("/auth/users")
      .then(setUsers)
      .catch((requestError: Error) => toast.error(`Daftar pengguna gagal dimuat: ${requestError.message}`));
  }, []);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.from && filters.to && filters.from > filters.to) {
      toast.error("Tanggal mulai tidak boleh melewati tanggal akhir.");
      return;
    }
    setPage(1);
    setAppliedFilters(filters);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Log audit" description="Telusuri perubahan data dan pengguna yang melakukannya." />

      <Card className="p-4">
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
          <div className="space-y-2">
            <Label htmlFor="audit-user">Pengguna</Label>
            <select id="audit-user" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={filters.userId} onChange={(event) => setFilters({ ...filters, userId: event.target.value })}>
              <option value="">Semua pengguna</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-entity">Jenis data</Label>
            <select id="audit-entity" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={filters.entity} onChange={(event) => setFilters({ ...filters, entity: event.target.value })}>
              <option value="">Semua jenis</option>
              {Object.entries(entityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-from">Dari tanggal</Label>
            <Input id="audit-from" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-to">Sampai tanggal</Label>
            <Input id="audit-to" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </div>
          <Button type="submit">Terapkan filter</Button>
        </form>
      </Card>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>Log audit gagal dimuat: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadAuditLogs()}>Coba lagi</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="hidden sm:block">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Pengguna</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Alamat IP</TableHead>
              <TableHead className="text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index}>
                {Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>)}
              </TableRow>
            )) : !result || result.data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{error ? "Data belum dapat ditampilkan." : "Belum ada aktivitas pada filter ini."}</TableCell></TableRow>
            ) : result.data.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">{dateFormatter.format(new Date(entry.createdAt))} WIB</TableCell>
                <TableCell>{entry.user.name}</TableCell>
                <TableCell className="font-medium">{entry.action.replaceAll("_", " ")}</TableCell>
                <TableCell>{entityLabels[entry.entity] ?? entry.entity}{entry.entityId ? ` #${entry.entityId}` : ""}</TableCell>
                <TableCell>{entry.ip ?? "—"}</TableCell>
                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setSelected(entry)}>Lihat</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {isLoading ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 rounded-lg" />) : !result || result.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{error ? "Data belum dapat ditampilkan." : "Belum ada aktivitas pada filter ini."}</p>
          ) : result.data.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{entry.action.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{entityLabels[entry.entity] ?? entry.entity}{entry.entityId ? ` #${entry.entityId}` : ""}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelected(entry)}>Detail</Button>
              </div>
              <p className="mt-3 text-sm">{entry.user.name}</p>
              <p className="text-xs text-muted-foreground">{dateFormatter.format(new Date(entry.createdAt))} WIB · {entry.ip ?? "IP tidak tersedia"}</p>
            </div>
          ))}
        </div>
      </Card>

      {result && result.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Halaman {page} dari {result.pagination.totalPages} · {result.pagination.total} aktivitas</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)}>Sebelumnya</Button>
            <Button variant="outline" size="sm" disabled={page >= result.pagination.totalPages || isLoading} onClick={() => setPage((current) => current + 1)}>Berikutnya</Button>
          </div>
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Detail aktivitas #{selected.id}</DialogTitle>
                <DialogDescription>{dateFormatter.format(new Date(selected.createdAt))} WIB · {selected.user.name} · {selected.action.replaceAll("_", " ")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-medium">Sebelum</h3>
                  <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(selected.before, null, 2) ?? "Tidak ada data sebelumnya"}</pre>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">Sesudah</h3>
                  <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(selected.after, null, 2) ?? "Tidak ada data sesudah"}</pre>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
