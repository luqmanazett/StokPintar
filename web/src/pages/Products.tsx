import { useState, useEffect, type FormEvent } from "react";
import { api, rupiah } from "../api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Product = { id: number; sku: string; name: string; category: string; sellPrice: number; minStock: number; stock: number };
type Category = { id: number; name: string };

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
      <PageHeader title="Produk" description="Kelola daftar produk dan pantau ketersediaan stok." />
      {error && <p className="text-sm text-red-600">{error}</p>}
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
          {products.map((p) => (
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
                  <Button variant="ghost" size="sm" onClick={() => addStock(p)}>
                    + Stok
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
    </div>
  );
}
