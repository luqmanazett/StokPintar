import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { PageHeader } from "@/components/page-header";
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

type Category = { id: number; name: string };

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      setCategories(await api<Category[]>("/categories"));
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
    void loadCategories();
  }, [loadCategories]);

  function openCreateDialog() {
    setEditingCategory(null);
    setCategoryName("");
    setFormError("");
    setDialogOpen(true);
  }

  function openEditDialog(category: Category) {
    setEditingCategory(category);
    setCategoryName(category.name);
    setFormError("");
    setDialogOpen(true);
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) {
      setFormError("Nama kategori wajib diisi.");
      return;
    }
    setIsSaving(true);
    try {
      if (editingCategory) {
        await api(`/categories/${editingCategory.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: categoryName.trim() }),
        });
        toast.success("Kategori berhasil diperbarui");
      } else {
        await api("/categories", { method: "POST", body: JSON.stringify({ name: categoryName.trim() }) });
        toast.success("Kategori berhasil ditambahkan");
      }
      setDialogOpen(false);
      await loadCategories();
    } catch (requestError) {
      const message = (requestError as Error).message;
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCategory() {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      await api(`/categories/${deletingCategory.id}`, { method: "DELETE" });
      toast.success("Kategori berhasil dihapus");
      setDeletingCategory(null);
      await loadCategories();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Kategori" description="Kelola pengelompokan produk toko." />
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>Kategori gagal dimuat: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadCategories()}>Coba lagi</Button>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={openCreateDialog}><Plus className="size-4" aria-hidden="true" />Tambah kategori</Button>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama kategori</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-8 w-24" /></TableCell>
                </TableRow>
              ))
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="h-28 text-center text-muted-foreground">
                  {error ? "Kategori belum dapat ditampilkan." : "Belum ada kategori. Tambahkan kategori untuk produk toko."}
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium text-slate-800">{category.name}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(category)} aria-label={`Ubah kategori ${category.name}`}>
                        <Pencil className="size-4" aria-hidden="true" />Ubah
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setDeletingCategory(category)} aria-label={`Hapus kategori ${category.name}`}>
                        <Trash2 className="size-4" aria-hidden="true" />Hapus
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={saveCategory} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{editingCategory ? "Ubah kategori" : "Tambah kategori"}</DialogTitle>
              <DialogDescription>Gunakan nama yang mudah dikenali saat memilih kategori produk.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="category-name">Nama kategori</Label>
              <Input id="category-name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} aria-invalid={Boolean(formError)} autoFocus />
              {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingCategory !== null} onOpenChange={(open) => !open && setDeletingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus kategori?</DialogTitle>
            <DialogDescription>
              {deletingCategory ? `Kategori “${deletingCategory.name}” akan dihapus. Kategori yang masih digunakan produk tidak dapat dihapus.` : "Kategori akan dihapus."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCategory(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => void deleteCategory()} disabled={isDeleting}>
              {isDeleting ? "Menghapus..." : "Hapus kategori"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
