import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
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

type Role = "ADMIN" | "MANAJER" | "GUDANG" | "KASIR";
type Account = {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

const roleLabels: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAJER: "Manajer",
  GUDANG: "Gudang",
  KASIR: "Kasir",
};

export default function CashierAccounts() {
  const [users, setUsers] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("KASIR");
  const [isSaving, setIsSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("KASIR");
  const [editActive, setEditActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      setUsers(await api<Account[]>("/auth/users"));
      setLoadError("");
    } catch (error) {
      const message = (error as Error).message;
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const created = await api<Account>("/auth/users", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("KASIR");
      toast.success(`Akun ${created.name} berhasil dibuat`);
      await loadUsers();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  function openEdit(user: Account) {
    setEditingUser(user);
    setEditName(user.name);
    setEditRole(user.role);
    setEditActive(user.isActive);
  }

  async function updateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    setIsUpdating(true);
    try {
      await api(`/auth/users/${editingUser.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName.trim(), role: editRole, isActive: editActive }),
      });
      toast.success("Akun berhasil diperbarui");
      setEditingUser(null);
      await loadUsers();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Akun pengguna" description="Buat akun dan atur peran serta status akses tim toko." />

      <Card className="max-w-3xl p-5 sm:p-6">
        <form onSubmit={createAccount} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="account-name">Nama lengkap</Label>
            <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-email">Email</Label>
            <Input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-password">Kata sandi awal</Label>
            <Input id="account-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-role">Peran</Label>
            <select id="account-role" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={isSaving} className="sm:col-span-2">
            <Plus className="size-4" aria-hidden="true" />
            {isSaving ? "Membuat akun..." : "Buat akun"}
          </Button>
        </form>
      </Card>

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>Akun gagal dimuat: {loadError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadUsers()}>Coba lagi</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="hidden sm:block">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 4 }, (_, index) => (
              <TableRow key={index}>
                {Array.from({ length: 5 }, (_, cell) => <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>)}
              </TableRow>
            )) : users.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">{loadError ? "Daftar akun belum dapat ditampilkan." : "Belum ada akun."}</TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{roleLabels[user.role]}</TableCell>
                <TableCell><Badge variant={user.isActive ? "success" : "secondary"}>{user.isActive ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openEdit(user)} aria-label={`Ubah akun ${user.name}`}>
                    <Pencil className="size-4" aria-hidden="true" /> Ubah
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {isLoading ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 rounded-lg" />) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{loadError ? "Daftar akun belum dapat ditampilkan." : "Belum ada akun."}</p>
          ) : users.map((user) => (
            <div key={user.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{user.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant={user.isActive ? "success" : "secondary"}>{user.isActive ? "Aktif" : "Nonaktif"}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{roleLabels[user.role]}</span>
                <Button variant="outline" size="sm" onClick={() => openEdit(user)} aria-label={`Ubah akun ${user.name}`}>Ubah</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={editingUser !== null} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <form onSubmit={updateAccount} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Ubah akun</DialogTitle>
              <DialogDescription>Perubahan peran dan status akses berlaku segera pada permintaan berikutnya.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="edit-account-name">Nama lengkap</Label>
              <Input id="edit-account-name" value={editName} onChange={(event) => setEditName(event.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-account-role">Peran</Label>
              <select id="edit-account-role" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={editRole} onChange={(event) => setEditRole(event.target.value as Role)}>
                {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} />
              Akun aktif
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Batal</Button>
              <Button type="submit" disabled={isUpdating}>{isUpdating ? "Menyimpan..." : "Simpan perubahan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
