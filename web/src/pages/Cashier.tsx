import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Banknote, Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, rupiah } from "../api";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: number;
  category: string;
  sellPrice: number;
  stock: number;
};
type Category = { id: number; name: string };
type Line = { product: Product; qty: number };
type PaymentMethod = "CASH" | "TRANSFER" | "QRIS";
type SaleResponse = {
  id: number;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
};
type Receipt = {
  id: number;
  items: Line[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashierName: string;
  createdAt: string;
};
type User = { name?: string } | null;

const paymentOptions: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Tunai" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "QRIS", label: "QRIS" },
];
const receiptDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "long",
  timeStyle: "short",
});

export default function Cashier() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User;
  const searchRef = useRef<HTMLInputElement>(null);
  const scanInProgressRef = useRef(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountError, setDiscountError] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("CASH");
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await api<Product[]>("/products?search=" + encodeURIComponent(search)));
      setError("");
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    searchRef.current?.focus();
    api<Category[]>("/categories")
      .then(setCategories)
      .catch((requestError: Error) => toast.error(`Kategori gagal dimuat: ${requestError.message}`));
  }, []);

  const filteredProducts = useMemo(
    () => categoryFilter === "all"
      ? products
      : products.filter((product) => String(product.categoryId) === categoryFilter),
    [categoryFilter, products],
  );
  const subtotal = cart.reduce((sum, line) => sum + line.qty * line.product.sellPrice, 0);
  const total = Math.max(subtotal - discount, 0);

  function add(product: Product) {
    setCart((current) => {
      const line = current.find((item) => item.product.id === product.id);
      if (!line) return product.stock > 0 ? [...current, { product, qty: 1 }] : current;
      if (line.qty >= product.stock) return current;
      return current.map((item) => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item);
    });
  }

  function adjustQuantity(productId: number, change: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      const quantity = Math.min(line.qty + change, line.product.stock);
      return quantity > 0 ? [{ ...line, qty: quantity }] : [];
    }));
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = search.trim();
    if (!code || scanInProgressRef.current) return;

    scanInProgressRef.current = true;
    void api<Product[]>("/products?search=" + encodeURIComponent(code))
      .then((matches) => {
        const product =
          matches.find((item) => item.barcode === code || item.sku === code) ??
          (matches.length === 1 ? matches[0] : undefined);
        if (!product) {
          toast.error("Produk tidak ditemukan. Periksa barcode atau kata pencarian.");
          return;
        }
        if (product.stock <= 0) {
          toast.error(`Stok ${product.name} habis`);
          return;
        }
        add(product);
        setSearch("");
      })
      .catch((requestError: Error) => toast.error(`Produk gagal dicari: ${requestError.message}`))
      .finally(() => {
        scanInProgressRef.current = false;
      });
  }

  function updateDiscount(value: string) {
    const amount = value === "" ? 0 : Number(value);
    setDiscount(amount);
    if (!Number.isInteger(amount) || amount < 0) {
      setDiscountError("Diskon harus berupa bilangan bulat minimal 0.");
    } else if (amount > subtotal) {
      setDiscountError("Diskon tidak boleh melebihi subtotal.");
    } else {
      setDiscountError("");
    }
  }

  async function checkout() {
    if (cart.length === 0 || isCheckingOut) return;
    if (!Number.isInteger(discount) || discount < 0 || discount > subtotal) {
      setDiscountError("Diskon harus berupa bilangan bulat antara 0 dan subtotal.");
      return;
    }

    setIsCheckingOut(true);
    const purchasedItems = cart.map((line) => ({ ...line }));
    try {
      const sale = await api<SaleResponse>("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((line) => ({ productId: line.product.id, quantity: line.qty })),
          discount,
          paymentMethod: payment,
        }),
      });
      setReceipt({
        id: sale.id,
        items: purchasedItems,
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        cashierName: user?.name ?? "Kasir",
        createdAt: sale.createdAt,
      });
      setCart([]);
      setDiscount(0);
      setDiscountError("");
      toast.success("Transaksi berhasil");
      await loadProducts();
    } catch (requestError) {
      toast.error((requestError as Error).message);
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Kasir" description="Pilih produk dan proses transaksi penjualan." />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                ref={searchRef}
                aria-label="Cari produk"
                placeholder="Pindai barcode atau cari nama/SKU, lalu tekan Enter"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            <select
              aria-label="Filter kategori produk"
              className="h-10 rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-48"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">Semua kategori</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div className="mb-4 mt-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Pilih produk</h2>
            {!isLoading && <span className="text-xs text-muted-foreground">{filteredProducts.length} produk</span>}
          </div>

          {error && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              <span>Gagal memuat produk: {error}</span>
              <Button variant="outline" size="sm" onClick={() => void loadProducts()}>Coba lagi</Button>
            </div>
          )}

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-32 rounded-lg" />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-slate-50 px-4 py-12 text-center">
              <ShoppingBag className="mx-auto size-8 text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-slate-800">{error ? "Produk belum tersedia" : "Produk tidak ditemukan"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error ? "Coba muat ulang daftar produk." : "Coba kata kunci atau kategori lainnya."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const line = cart.find((item) => item.product.id === product.id);
                const outOfStock = product.stock <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => add(product)}
                    disabled={outOfStock}
                    className="group flex min-h-32 flex-col justify-between rounded-lg border bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-900">{product.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{product.sku} · {product.category}</p>
                      </div>
                      <Badge variant={outOfStock ? "destructive" : "secondary"}>{outOfStock ? "Habis" : `Stok ${product.stock}`}</Badge>
                    </div>
                    <div className="mt-4 flex w-full items-center justify-between">
                      <span className="text-sm font-semibold text-indigo-700">{rupiah(product.sellPrice)}</span>
                      {line && <span className="text-xs font-medium text-indigo-600">Di keranjang: {line.qty}</span>}
                      {!line && !outOfStock && <Plus className="size-4 text-slate-400 group-hover:text-indigo-600" aria-hidden="true" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="min-w-0 p-4 lg:sticky lg:top-6 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Keranjang</h2>
              <p className="mt-1 text-sm text-muted-foreground">{cart.reduce((sum, line) => sum + line.qty, 0)} item</p>
            </div>
            <ShoppingBag className="size-5 text-indigo-600" aria-hidden="true" />
          </div>

          {cart.length === 0 ? (
            <div className="my-6 rounded-lg border border-dashed bg-slate-50 px-4 py-8 text-center">
              <ShoppingBag className="mx-auto size-7 text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-slate-800">Keranjang masih kosong</p>
              <p className="mt-1 text-xs text-muted-foreground">Pilih produk untuk memulai transaksi.</p>
            </div>
          ) : (
            <div className="my-5 max-h-72 space-y-4 overflow-y-auto">
              {cart.map((line) => (
                <div key={line.product.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{line.product.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{rupiah(line.product.sellPrice)} / item</p>
                    <div className="mt-2 inline-flex items-center gap-1 rounded-md border p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Kurangi jumlah ${line.product.name}`}
                        onClick={() => adjustQuantity(line.product.id, -1)}
                      >
                        <Minus className="size-3.5" aria-hidden="true" />
                      </Button>
                      <span className="min-w-7 text-center text-sm font-medium">{line.qty}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Tambah jumlah ${line.product.name}`}
                        onClick={() => adjustQuantity(line.product.id, 1)}
                        disabled={line.qty >= line.product.stock}
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-slate-900">{rupiah(line.qty * line.product.sellPrice)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-slate-500 hover:text-red-600"
                      aria-label={`Hapus ${line.product.name} dari keranjang`}
                      onClick={() => adjustQuantity(line.product.id, -line.qty)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="sale-discount">Diskon (Rp)</Label>
              <Input
                id="sale-discount"
                type="number"
                min="0"
                max={subtotal}
                step="1"
                value={discount}
                onChange={(event) => updateDiscount(event.target.value)}
                aria-invalid={Boolean(discountError)}
              />
              {discountError && <p className="text-xs text-red-600">{discountError}</p>}
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Metode pembayaran</legend>
              <div className="grid grid-cols-3 gap-2">
                {paymentOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={payment === option.value ? "secondary" : "outline"}
                    className={payment === option.value ? "border-indigo-200 ring-1 ring-indigo-200" : ""}
                    aria-pressed={payment === option.value}
                    onClick={() => setPayment(option.value)}
                  >
                    {option.value === "CASH" && <Banknote className="size-4" aria-hidden="true" />}
                    {option.label}
                  </Button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{rupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Diskon</span>
                <span>-{rupiah(discount)}</span>
              </div>
              <div className="flex items-end justify-between pt-1">
                <span className="font-medium text-slate-700">Total pembayaran</span>
                <span className="text-2xl font-bold tracking-tight text-slate-900">{rupiah(total)}</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => void checkout()}
              disabled={cart.length === 0 || isCheckingOut || Boolean(discountError)}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {isCheckingOut ? "Memproses pembayaran..." : `Bayar ${rupiah(total)}`}
            </Button>
          </div>
        </Card>
      </div>

      <Dialog open={receipt !== null} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="receipt-print max-h-[90vh] overflow-y-auto">
          {receipt && (
            <>
              <DialogHeader className="text-center">
                <DialogTitle className="text-center text-xl">StokPintar</DialogTitle>
                <DialogDescription className="text-center">Struk transaksi penjualan</DialogDescription>
              </DialogHeader>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">No. transaksi</span><span className="font-medium">#{receipt.id}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Kasir</span><span className="font-medium">{receipt.cashierName}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Waktu</span><span className="text-right font-medium">{receiptDateFormatter.format(new Date(receipt.createdAt))} WIB</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Pembayaran</span><span className="font-medium">{paymentOptions.find((option) => option.value === receipt.paymentMethod)?.label}</span></div>
              </div>
              <div className="border-y py-3">
                <p className="mb-2 text-sm font-semibold">Rincian item</p>
                <div className="space-y-2">
                  {receipt.items.map((line) => (
                    <div key={line.product.id} className="flex justify-between gap-3 text-sm">
                      <span>{line.product.name} × {line.qty}</span>
                      <span className="shrink-0">{rupiah(line.product.sellPrice * line.qty)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(receipt.subtotal)}</span></div>
                <div className="flex justify-between"><span>Diskon</span><span>-{rupiah(receipt.discount)}</span></div>
                <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{rupiah(receipt.total)}</span></div>
              </div>
              <p className="text-center text-xs text-muted-foreground">Terima kasih telah berbelanja.</p>
              <DialogFooter className="receipt-dialog-actions">
                <Button type="button" variant="outline" onClick={() => setReceipt(null)}>Tutup</Button>
                <Button type="button" onClick={() => window.print()}>Cetak struk</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
