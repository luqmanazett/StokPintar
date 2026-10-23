import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreatedUser = { id: number; name: string; email: string; role: "ADMIN" | "KASIR" };

export default function CashierAccounts() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const created = await api<CreatedUser>("/auth/users", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role: "KASIR" }),
      });
      setName("");
      setEmail("");
      setPassword("");
      toast.success(`Akun kasir ${created.name} berhasil dibuat`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Akun kasir" description="Buat akun baru untuk anggota tim kasir." />
      <Card className="max-w-2xl p-5 sm:p-6">
        <form onSubmit={createAccount} className="space-y-5">
          <div>
            <h2 className="font-semibold text-slate-900">Buat akun kasir</h2>
            <p className="mt-1 text-sm text-muted-foreground">Akun baru akan dibuat dengan peran Kasir.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cashier-name">Nama lengkap</Label>
            <Input id="cashier-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cashier-email">Email</Label>
            <Input id="cashier-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cashier-password">Kata sandi</Label>
            <Input id="cashier-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="new-password" />
            <p className="text-xs text-muted-foreground">Minimal 6 karakter.</p>
          </div>
          <Button type="submit" disabled={isSaving}>{isSaving ? "Membuat akun..." : "Buat akun kasir"}</Button>
        </form>
      </Card>
    </div>
  );
}
