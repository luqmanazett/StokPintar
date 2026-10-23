import { useState, useEffect } from "react";
import { api, rupiah } from "../api";

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
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Pilih produk</h1>
        <input className="w-full rounded border px-2 py-1" placeholder="Cari produk" value={search} onChange={(e) => setSearch(e.target.value)} />
        {products.map((p) => (
          <button key={p.id} onClick={() => add(p)} disabled={p.stock <= 0} className="flex w-full justify-between rounded bg-white p-2 text-left shadow disabled:opacity-40">
            <span>
              {p.name} (stok {p.stock})
            </span>
            <span>{rupiah(p.sellPrice)}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded bg-white p-4 shadow">
        <h2 className="text-lg font-bold">Keranjang</h2>
        {cart.map((l) => (
          <div key={l.product.id} className="flex justify-between text-sm">
            <span>
              {l.product.name} x {l.qty}
            </span>
            <span>
              {rupiah(l.qty * l.product.sellPrice)}{" "}
              <button className="text-red-600" onClick={() => remove(l.product.id)}>
                hapus
              </button>
            </span>
          </div>
        ))}
        <label className="block text-sm">
          Diskon <input type="number" className="rounded border px-2 py-1" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        </label>
        <select className="rounded border px-2 py-1" value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="CASH">Tunai</option>
          <option value="TRANSFER">Transfer</option>
          <option value="QRIS">QRIS</option>
        </select>
        <p className="text-lg font-bold">Total: {rupiah(total)}</p>
        <button onClick={checkout} disabled={cart.length === 0} className="w-full rounded bg-green-600 py-2 text-white disabled:opacity-40">
          Bayar
        </button>
        {message && <p className="text-sm">{message}</p>}
      </div>
    </div>
  );
}
