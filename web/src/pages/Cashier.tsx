import { useState, useEffect, useCallback } from "react";
import { api, rupiah } from "../api";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Product = { id: number; name: string; sellPrice: number; stock: number };
type Line = { product: Product; qty: number };

export default function Cashier() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState("CASH");
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await api<Product[]>("/products?search=" + encodeURIComponent(search)));
      setError("");
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  function add(product: Product) {
    setCart((c) => {
      const line = c.find((l) => l.product.id === product.id);
      if (!line) return product.stock > 0 ? [...c, { product, qty: 1 }] : c;
      return c.map((l) => (l.product.id === product.id ? { ...l, qty: Math.min(l.qty + 1, product.stock) } : l));
    });
  }

  function remove(id: number) {
    setCart((c) => c.filter((l) => l.product.id !== id));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.qty * l.product.sellPrice, 0);
  const total = Math.max(subtotal - discount, 0);

  async function checkout() {
    setIsCheckingOut(true);
    try {
      await api("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((l) => ({ productId: l.product.id, quantity: l.qty })),
          discount,
          paymentMethod: payment,
        }),
      });
      setCart([]);
      setDiscount(0);
      toast.success("Transaksi berhasil");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <div>
      <PageHeader title="Kasir" description="Pilih produk untuk memulai transaksi penjualan." />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-slate-700">Pilih produk</h2>
          <Input placeholder="Cari produk" value={search} onChange={(e) => setSearch(e.target.value)} />
          {error && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              <span>Gagal memuat produk: {error}</span>
              <Button variant="outline" size="sm" onClick={() => void load()}>Coba lagi</Button>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : products.length === 0 ? (
            <p className="rounded-md bg-slate-50 p-4 text-sm text-muted-foreground">
              {error ? "Produk belum dapat ditampilkan." : "Belum ada produk yang cocok dengan pencarian."}
            </p>
          ) : (
            products.map((p) => (
              <Button key={p.id} variant="outline" onClick={() => add(p)} disabled={p.stock <= 0} className="h-auto w-full justify-between py-3 text-left">
                <span>
                  {p.name} <span className="text-xs text-muted-foreground">(stok {p.stock})</span>
                </span>
                <span>{rupiah(p.sellPrice)}</span>
              </Button>
            ))
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-semibold">Keranjang</h2>
          {cart.map((l) => (
            <div key={l.product.id} className="flex justify-between gap-3 text-sm">
              <span>
                {l.product.name} x {l.qty}
              </span>
              <span className="shrink-0">
                {rupiah(l.qty * l.product.sellPrice)}{" "}
                <Button variant="link" size="sm" className="h-auto px-1 text-red-600" onClick={() => remove(l.product.id)}>
                  hapus
                </Button>
              </span>
            </div>
          ))}
          <label className="block text-sm">
            Diskon <Input type="number" className="mt-1" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </label>
          <select className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="CASH">Tunai</option>
            <option value="TRANSFER">Transfer</option>
            <option value="QRIS">QRIS</option>
          </select>
          <p className="pt-2 text-xl font-semibold">Total: {rupiah(total)}</p>
          <Button onClick={checkout} disabled={cart.length === 0 || isCheckingOut} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {isCheckingOut ? "Memproses pembayaran..." : "Bayar"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
