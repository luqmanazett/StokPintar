import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { toast } from "sonner";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-provider";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const isDemoMode = import.meta.env.VITE_DEMO_MODE;

  const demoAccounts = [
    { role: "ADMIN", label: "Admin", email: "admin@stokpintar.test", password: "admin123" },
    { role: "MANAJER", label: "Manajer", email: "manajer@stokpintar.test", password: "manajer123" },
    { role: "GUDANG", label: "Gudang", email: "gudang@stokpintar.test", password: "gudang123" },
    { role: "KASIR", label: "Kasir", email: "kasir@stokpintar.test", password: "kasir123" },
  ];

  useEffect(() => {
    if (sessionStorage.getItem("stokpintar-session-ended") === "true") {
      sessionStorage.removeItem("stokpintar-session-ended");
      toast.error("Sesi berakhir");
    }
  }, []);

  async function login(loginEmail: string, loginPassword: string) {
    setError("");
    setIsLoading(true);
    try {
      const data = await api<{ token: string; user: object }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void login(email, password);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm p-7 shadow-md">
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Store className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Masuk ke StokPintar</h1>
              <p className="mt-1 text-sm text-muted-foreground">Kelola toko dengan lebih mudah.</p>
            </div>
          </div>
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@toko.id" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Kata sandi</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan kata sandi" />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Memproses..." : "Masuk"}
          </Button>
          {isDemoMode && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-center text-sm font-medium text-slate-700">Masuk cepat untuk demo</p>
              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map((account) => (
                  <Button
                    key={account.role}
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    onClick={() => void login(account.email, account.password)}
                  >
                    Masuk sebagai {account.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
