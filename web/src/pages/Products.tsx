import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, History, PackagePlus, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api, rupiah } from "../api";
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

type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: number;
  category: string;
  costPrice: number;
  sellPrice: number;
  minStock: number;
  stock: number;
};
type Category = { id: number; name: string };
type ProductForm = {
  sku: string;
  barcode: string;
  name: string;
  categoryId: number;
  costPrice: number;
  sellPrice: number;
  minStock: number;
};
type FormErrors = Partial<Record<keyof ProductForm, string>>;
type Movement = {
  id: number;
  type: string;
  change: number;
  note: string | null;
  createdAt: string;
  createdBy: { name: string };
};
type User = { role?: string } | null;

const emptyForm: ProductForm = {
  sku: "",
  barcode: "",
  name: "",
  categoryId: 0,
  costPrice: 0,
  sellPrice: 0,
  minStock: 5,
};
const pageSize = 10;
const movementDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});
const movementLabels: Record<string, string> = {
  IN: "Stok masuk",
  OUT: "Stok keluar",
  ADJUSTMENT: "Penyesuaian",
  SALE: "Penjualan",
  VOID: "Pembatalan",
  PURCHASE: "Pembelian",
  OPNAME: "Stok opname",
  SALE_RETURN: "Retur penjualan",
};

function validateProduct(form: ProductForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.sku.trim()) errors.sku = "SKU wajib diisi.";
  if (form.barcode.trim().length > 128) errors.barcode = "Barcode maksimal 128 karakter.";
  if (!form.name.trim()) errors.name = "Nama produk wajib diisi.";
  if (!Number.isInteger(form.categoryId) || form.categoryId <= 0) errors.categoryId = "Pilih kategori.";
  if (!Number.isInteger(form.costPrice) || form.costPrice < 0) errors.costPrice = "Harga beli harus berupa bilangan bulat minimal 0.";
  if (!Number.isInteger(form.sellPrice) || form.sellPrice < 0) errors.sellPrice = "Harga jual harus berupa bilangan bulat minimal 0.";
  if (!Number.isInteger(form.minStock) || form.minStock < 0) errors.minStock = "Stok minimum harus berupa bilangan bulat minimal 0.";
  return errors;
}

function stockStatus(product: Product) {
  if (product.stock <= 0) return { label: "Habis", variant: "destructive" as const };
  if (product.stock < product.minStock) return { label: "Menipis", variant: "warning" as const };
  return { label: "Aman", variant: "success" as const };
}

export default function Products() {
  const [searchParams] = useSearchParams();
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User;
  const canManageProducts = user?.role === "ADMIN" || user?.role === "GUDANG";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [productError, setProductError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockNote, setStockNote] = useState("Barang masuk");
  const [stockError, setStockError] = useState("");
  const [isSavingStock, setIsSavingStock] = useState(false);

  const [archivingProduct, setArchivingProduct] = useState<Product | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [movementProduct, setMovementProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementError, setMovementError] = useState("");
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await api<Product[]>("/products?search=" + encodeURIComponent(search)));
      setProductError("");
    } catch (error) {
      const message = (error as Error).message;
      setProductError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await api<Category[]>("/categories"));
      setCategoryError("");
    } catch (error) {
      const message = (error as Error).message;
      setCategoryError(message);
      toast.error(message);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  function openCreateDialog() {
    setEditingProduct(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? 0 });
    setFormErrors({});
    setFormError("");
    setProductDialogOpen(true);
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product);
    setForm({
      sku: product.sku,
      barcode: product.barcode ?? "",
      name: product.name,
      categoryId: product.categoryId,
      costPrice: product.costPrice,
      sellPrice: product.sellPrice,
      minStock: product.minStock,
    });
    setFormErrors({});
    setFormError("");
    setProductDialogOpen(true);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateProduct(form);
    setFormErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    setIsSavingProduct(true);
    const payload = {
      ...form,
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || null,
      name: form.name.trim(),
    };
    try {
      if (editingProduct) {
        await api(`/products/${editingProduct.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast.success("Produk berhasil diperbarui");
      } else {
        await api("/products", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Produk berhasil ditambahkan");
      }
      setProductDialogOpen(false);
      await loadProducts();
    } catch (error) {
      const message = (error as Error).message;
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSavingProduct(false);
    }
  }

  function openStockDialog(product: Product) {
    setStockProduct(product);
    setStockQuantity("");
    setStockNote("Barang masuk");
    setStockError("");
  }

  async function addStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    } catch (error) {
      const message = (error as Error).message;
      setStockError(message);
      toast.error(message);
    } finally {
      setIsSavingStock(false);
    }
  }

  async function archiveProduct() {
    if (!archivingProduct) return;
    setIsArchiving(true);
    try {
      await api(`/products/${archivingProduct.id}`, { method: "DELETE" });
      toast.success("Produk berhasil diarsipkan");
      setArchivingProduct(null);
      await loadProducts();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsArchiving(false);
    }
  }

  async function openMovementDialog(product: Product) {
    setMovementProduct(product);
    setMovements([]);
    setMovementError("");
    setIsLoadingMovements(true);
    try {
      setMovements(await api<Movement[]>(`/products/${product.id}/movements`));
    } catch (error) {
      const message = (error as Error).message;
      setMovementError(message);
      toast.error(message);
    } finally {
      setIsLoadingMovements(false);
    }
  }

  const filteredProducts =
    categoryFilter === "all"
      ? products
      : products.filter((product) => String(product.categoryId) === categoryFilter);
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => ({ ...current, [key]: undefined }));
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Produk" description="Kelola katalog produk, kategori, dan ketersediaan stok." />

      {(productError || categoryError) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>{productError ? `Gagal memuat produk: ${productError}` : `Gagal memuat kategori: ${categoryError}`}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadProducts();
              void loadCategories();
            }}
          >
            Coba lagi
          </Button>
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            aria-label="Cari produk"
            className="pl-9"
            placeholder="Cari nama, SKU, atau barcode"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-44">
            <Label className="sr-only" htmlFor="category-filter">Filter kategori</Label>
            <select
              id="category-filter"
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">Semua kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          {canManageProducts && (
            <Button onClick={openCreateDialog} disabled={categories.length === 0}>
              <Plus className="size-4" aria-hidden="true" />
              Tambah produk
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Nama produk</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Harga jual</TableHead>
              <TableHead>Stok</TableHead>
              {canManageProducts && <TableHead className="text-right">Aksi</TableHead>}
              {!canManageProducts && <TableHead className="text-right">Riwayat</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }, (_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 7 }, (_, cell) => (
                    <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : visibleProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center">
                  <p className="font-medium text-slate-800">
                    {productError ? "Produk belum dapat ditampilkan." : products.length === 0 ? "Belum ada produk" : "Produk tidak ditemukan"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {products.length === 0 ? "Tambahkan produk untuk mulai mengelola stok toko." : "Ubah kata kunci atau filter kategori."}
                  </p>
                  {canManageProducts && products.length === 0 && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={openCreateDialog} disabled={categories.length === 0}>
                      <Plus className="size-4" aria-hidden="true" />
                      Tambah produk
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              visibleProducts.map((product) => {
                const status = stockStatus(product);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="whitespace-nowrap font-medium text-slate-600">{product.sku}</TableCell>
                    <TableCell className="whitespace-nowrap text-slate-600">{product.barcode ?? "—"}</TableCell>
                    <TableCell className="min-w-40 font-medium text-slate-900">{product.name}</TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell className="whitespace-nowrap">{rupiah(product.sellPrice)}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label} · {product.stock}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void openMovementDialog(product)} aria-label={`Riwayat stok ${product.name}`}>
                          <History className="size-4" aria-hidden="true" />
                          <span className="hidden lg:inline">Riwayat</span>
                        </Button>
                        {canManageProducts && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openStockDialog(product)} aria-label={`Tambah stok ${product.name}`}>
                              <PackagePlus className="size-4" aria-hidden="true" />
                              <span className="hidden lg:inline">Stok</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(product)} aria-label={`Edit ${product.name}`}>
                              <Pencil className="size-4" aria-hidden="true" />
                              <span className="hidden lg:inline">Edit</span>
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setArchivingProduct(product)} aria-label={`Arsipkan ${product.name}`}>
                              <Archive className="size-4" aria-hidden="true" />
                              <span className="hidden lg:inline">Arsip</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {!isLoading && filteredProducts.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Menampilkan {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredProducts.length)} dari {filteredProducts.length} produk
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={currentPage === 1}>
              Sebelumnya
            </Button>
            <span className="min-w-20 text-center text-sm text-muted-foreground">Halaman {currentPage} / {pageCount}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(current + 1, pageCount))} disabled={currentPage === pageCount}>
              Berikutnya
            </Button>
          </div>
        </div>
      )}

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={saveProduct} noValidate className="space-y-5">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit produk" : "Tambah produk"}</DialogTitle>
              <DialogDescription>
                {editingProduct ? "Perbarui informasi produk. Perubahan langsung disimpan." : "Lengkapi informasi produk baru."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-sku">SKU</Label>
                <Input id="product-sku" value={form.sku} onChange={(event) => updateForm("sku", event.target.value)} aria-invalid={Boolean(formErrors.sku)} />
                {formErrors.sku && <p className="text-xs text-red-600">{formErrors.sku}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-barcode">Barcode (opsional)</Label>
                <Input id="product-barcode" value={form.barcode} onChange={(event) => updateForm("barcode", event.target.value)} aria-invalid={Boolean(formErrors.barcode)} />
                {formErrors.barcode && <p className="text-xs text-red-600">{formErrors.barcode}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-name">Nama produk</Label>
                <Input id="product-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} aria-invalid={Boolean(formErrors.name)} />
                {formErrors.name && <p className="text-xs text-red-600">{formErrors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-category">Kategori</Label>
                <select
                  id="product-category"
                  className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.categoryId}
                  onChange={(event) => updateForm("categoryId", Number(event.target.value))}
                  aria-invalid={Boolean(formErrors.categoryId)}
                >
                  <option value={0}>Pilih kategori</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                {formErrors.categoryId && <p className="text-xs text-red-600">{formErrors.categoryId}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-cost">Harga beli</Label>
                <Input id="product-cost" type="number" min="0" step="1" value={form.costPrice} onChange={(event) => updateForm("costPrice", Number(event.target.value))} aria-invalid={Boolean(formErrors.costPrice)} />
                {formErrors.costPrice && <p className="text-xs text-red-600">{formErrors.costPrice}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-price">Harga jual</Label>
                <Input id="product-price" type="number" min="0" step="1" value={form.sellPrice} onChange={(event) => updateForm("sellPrice", Number(event.target.value))} aria-invalid={Boolean(formErrors.sellPrice)} />
                {formErrors.sellPrice && <p className="text-xs text-red-600">{formErrors.sellPrice}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-min-stock">Stok minimum</Label>
                <Input id="product-min-stock" type="number" min="0" step="1" value={form.minStock} onChange={(event) => updateForm("minStock", Number(event.target.value))} aria-invalid={Boolean(formErrors.minStock)} />
                {formErrors.minStock && <p className="text-xs text-red-600">{formErrors.minStock}</p>}
              </div>
            </div>
            {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={isSavingProduct}>
                {isSavingProduct ? "Menyimpan..." : editingProduct ? "Simpan perubahan" : "Tambah produk"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              <Input id="stock-quantity" type="number" min="1" step="1" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} />
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

      <Dialog open={archivingProduct !== null} onOpenChange={(open) => !open && setArchivingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arsipkan produk?</DialogTitle>
            <DialogDescription>
              {archivingProduct
                ? `${archivingProduct.name} akan disembunyikan dari katalog aktif. Riwayat transaksi tetap tersimpan.`
                : "Produk akan disembunyikan dari katalog aktif."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchivingProduct(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => void archiveProduct()} disabled={isArchiving}>
              {isArchiving ? "Mengarsipkan..." : "Arsipkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movementProduct !== null} onOpenChange={(open) => !open && setMovementProduct(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Riwayat stok</DialogTitle>
            <DialogDescription>{movementProduct?.name} · Maksimal 50 perubahan stok terakhir.</DialogDescription>
          </DialogHeader>
          {movementError && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              <span>{movementError}</span>
              {movementProduct && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (movementProduct) void openMovementDialog(movementProduct);
                  }}
                >
                  Coba lagi
                </Button>
              )}
            </div>
          )}
          {isLoadingMovements ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : movementError ? null : movements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada riwayat perubahan stok.</p>
          ) : (
            <div className="divide-y">
              {movements.map((movement) => (
                <div key={movement.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{movementLabels[movement.type] ?? "Perubahan stok"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {movement.note || "Tanpa catatan"} · {movement.createdBy.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {movementDateFormatter.format(new Date(movement.createdAt))}
                    </p>
                  </div>
                  <Badge variant={movement.change > 0 ? "success" : movement.change < 0 ? "warning" : "outline"}>
                    {movement.change > 0 ? "+" : ""}{movement.change}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
