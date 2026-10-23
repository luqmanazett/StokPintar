import { useState, useEffect, useCallback, type FormEvent } from "react";
import { api, rupiah } from "../api";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Product = { id: number; sku: string; name: string; category: string; sellPrice: number; minStock: number; stock: number };
type Category = { id: number; name: string };

export default function Products() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null");
  const isAdmin = user?.role === "ADMIN";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [productError, setProductError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockNote, setStockNote] = useState("Barang masuk");
  const [stockError, setStockError] = useState("");
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [form, setForm] = useState({ sku: "", name: "", categoryId: 0, costPrice: 0, sellPrice: 0, minStock: 5 });

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await api<Product[]>("/products?search=" + encodeURIComponent(search)));
      setProductError("");
    } catch (e) {
      const message = (e as Error).message;
      setProductError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await api<Category[]>("/categories");
      setCategories(cats);
      setForm((f) => ({ ...f, categoryId: cats[0]?.id ?? 0 }));
      setCategoryError("");
    } catch (e) {
      const message = (e as Error).message;
      setCategoryError(message);
      toast.error(message);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function retryLoad() {
    await Promise.all([loadProducts(), loadCategories()]);
  }

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/products", { method: "POST", body: JSON.stringify(form) });
      setForm({ ...form, sku: "", name: "" });
      toast.success("Produk berhasil ditambahkan");
      await loadProducts();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function openStockDialog(product: Product) {
    setStockProduct(product);
    setStockQuantity("");
    setStockNote("Barang masuk");
    setStockError("");
  }

  async function addStock(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(stockQuantity);
    if (!stockProduct || !Number.isInteger(quantity) || quantity <= 0) {
      setStockError("Masukkan jumlah stok berupa bilangan bulat lebih dari 0.");
      return;
    }

    setIsSavingStock(true);
    try {
      await api("/stock/in", {
        method: "POST",
        body: JSON.stringify({ productId: stockProduct.id, quantity, note: stockNote }),
      });
      toast.success("Stok berhasil ditambahkan");
      setStockProduct(null);
      await loadProducts();
    } catch (err) {
      const message = (err as Error).message;
      setStockError(message);
      toast.error(message);
    } finally {
      setIsSavingStock(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Produk" description="Kelola daftar produk dan pantau ketersediaan stok." />
      {productError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>Gagal memuat produk: {productError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadProducts()}>Coba lagi</Button>
        </div>
      )}
      {categoryError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>Gagal memuat kategori: {categoryError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadCategories()}>Coba lagi</Button>
        </div>
      )}
      <Input className="max-w-md" placeholder="Cari nama atau SKU" value={search} onChange={(e) => setSearch(e.target.value)} />

      {isAdmin && (
        <Card className="p-4">
          <form onSubmit={addProduct} className="flex flex-wrap gap-2">
          <Input className="w-auto min-w-36" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <Input className="w-auto min-w-44" placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          <Input className="w-auto min-w-32" type="number" placeholder="Harga beli" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} />
          <Input className="w-auto min-w-32" type="number" placeholder="Harga jual" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: Number(e.target.value) })} />
          <Button type="submit">Tambah</Button>
          </form>
        </Card>
      )}

    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>Harga</TableHead>
            <TableHead>Stok</TableHead>
            {isAdmin && <TableHead>Aksi</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 4 }, (_, index) => (
              <TableRow key={index}>
                {Array.from({ length: isAdmin ? 6 : 5 }, (_, cellIndex) => (
                  <TableCell key={cellIndex}><Skeleton className="h-5 w-24" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isAdmin ? 6 : 5} className="h-28 text-center text-muted-foreground">
                {productError ? "Produk belum dapat ditampilkan." : "Belum ada produk. Tambahkan produk untuk mulai mengelola stok."}
              </TableCell>
            </TableRow>
          ) : products.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium text-slate-600">{p.sku}</TableCell>
              <TableCell className="font-medium text-slate-900">{p.name}</TableCell>
              <TableCell>{p.category}</TableCell>
              <TableCell>{rupiah(p.sellPrice)}</TableCell>
              <TableCell>
                <Badge variant={p.stock <= 0 ? "destructive" : p.stock < p.minStock ? "warning" : "success"}>
                  {p.stock <= 0 ? "Habis" : p.stock < p.minStock ? "Menipis" : "Aman"} · {p.stock}
                </Badge>
              </TableCell>
              {isAdmin && (
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openStockDialog(p)}>
                    + Stok
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>

    {productError && categoryError && (
      <Button variant="outline" onClick={() => void retryLoad()}>Coba muat ulang</Button>
    )}

    <Dialog open={stockProduct !== null} onOpenChange={(open) => !open && setStockProduct(null)}>
      <DialogContent>
        <form onSubmit={addStock} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Tambah stok</DialogTitle>
            <DialogDescription>
              {stockProduct ? `Masukkan stok baru untuk ${stockProduct.name}.` : "Masukkan jumlah dan catatan stok masuk."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="stock-quantity">Jumlah stok</Label>
            <Input
              id="stock-quantity"
              type="number"
              min="1"
              step="1"
              value={stockQuantity}
              onChange={(event) => setStockQuantity(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-note">Catatan</Label>
            <Input id="stock-note" value={stockNote} onChange={(event) => setStockNote(event.target.value)} />
          </div>
          {stockError && <p className="text-sm text-red-600" role="alert">{stockError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStockProduct(null)}>Batal</Button>
            <Button type="submit" disabled={isSavingStock}>{isSavingStock ? "Menyimpan..." : "Simpan stok"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </div>
  );
}
