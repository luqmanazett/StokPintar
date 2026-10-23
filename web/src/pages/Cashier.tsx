import { useState, useEffect } from "react";
import { api, rupiah } from "../api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Product = { id: number; name: string; sellPrice: number; stock: number };
type Line = { product: Product; qty: number };

export default function Cashier() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState("CASH");
  const [message, setMessage] = useState("");

  async function load() {
    setProducts(await api<Product[]>("/products?search=" + encodeURIComponent(search)));
  }

  useEffect(() => {
    load();
  }, [search]);

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
      setMessage("Transaksi berhasil");
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader title="Kasir" description="Pilih produk untuk memulai transaksi penjualan." />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-slate-700">Pilih produk</h2>
          <Input placeholder="Cari produk" value={search} onChange={(e) => setSearch(e.target.value)} />
          {products.map((p) => (
            <Button key={p.id} variant="outline" onClick={() => add(p)} disabled={p.stock <= 0} className="h-auto w-full justify-between py-3 text-left">
              <span>
                {p.name} <span className="text-xs text-muted-foreground">(stok {p.stock})</span>
              </span>
              <span>{rupiah(p.sellPrice)}</span>
            </Button>
          ))}
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
          <Button onClick={checkout} disabled={cart.length === 0} className="w-full bg-emerald-600 hover:bg-emerald-700">
            Bayar
          </Button>
          {message && <p className="text-sm">{message}</p>}
        </Card>
      </div>
    </div>
  );
}
