import { useState, useEffect, type FormEvent } from "react";
import { api, rupiah } from "../api";

type Product = { id: number; sku: string; name: string; category: string; sellPrice: number; minStock: number; stock: number };
type Category = { id: number; name: string };

const box = "rounded border px-2 py-1";

export default function Products() {
  const user = JSON.parse(localStorage.getItem("user") ?? "null");
  const isAdmin = user?.role === "ADMIN";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ sku: "", name: "", categoryId: 0, costPrice: 0, sellPrice: 0, minStock: 5 });

  async function load() {
    try {
      setProducts(await api<Product[]>("/products?search=" + encodeURIComponent(search)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [search]);

  useEffect(() => {
    api<Category[]>("/categories").then((cats) => {
      setCategories(cats);
      setForm((f) => ({ ...f, categoryId: cats[0]?.id ?? 0 }));
    });
  }, []);

  async function addProduct(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/products", { method: "POST", body: JSON.stringify(form) });
      setForm({ ...form, sku: "", name: "" });
      setError("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addStock(p: Product) {
    const qty = Number(window.prompt("Tambah stok " + p.name + " berapa?"));
    if (!qty || qty <= 0) return;
    await api("/stock/in", {
      method: "POST",
      body: JSON.stringify({ productId: p.id, quantity: qty, note: "Barang masuk" }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produk</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <input className={box} placeholder="Cari nama atau SKU" value={search} onChange={(e) => setSearch(e.target.value)} />

      {isAdmin && (
        <form onSubmit={addProduct} className="flex flex-wrap gap-2 rounded bg-white p-3 shadow">
          <input className={box} placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <input className={box} placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className={box} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input className={box} type="number" placeholder="Harga beli" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} />
          <input className={box} type="number" placeholder="Harga jual" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: Number(e.target.value) })} />
          <button className="rounded bg-blue-600 px-3 py-1 text-white">Tambah</button>
        </form>
      )}

      <table className="w-full bg-white text-left text-sm shadow">
        <thead className="border-b">
          <tr>
            <th className="p-2">SKU</th>
            <th>Nama</th>
            <th>Kategori</th>
            <th>Harga</th>
            <th>Stok</th>
            {isAdmin && <th>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="p-2">{p.sku}</td>
              <td>{p.name}</td>
              <td>{p.category}</td>
              <td>{rupiah(p.sellPrice)}</td>
              <td className={p.stock < p.minStock ? "font-bold text-red-600" : ""}>{p.stock}</td>
              {isAdmin && (
                <td>
                  <button onClick={() => addStock(p)} className="text-sm text-blue-600">
                    + Stok
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
