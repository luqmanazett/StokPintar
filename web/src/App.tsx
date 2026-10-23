import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShoppingCart,
  Store,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import Cashier from "./pages/Cashier";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Products from "./pages/Products";
import Transactions from "./pages/Transactions";
import Categories from "./pages/Categories";
import CashierAccounts from "./pages/CashierAccounts";
import NotFound from "./pages/NotFound";

type User = {
  name?: string;
  role?: "ADMIN" | "KASIR";
};

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const navigation: NavigationItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Produk", href: "/products", icon: Package },
  { label: "Kasir", href: "/cashier", icon: ShoppingCart },
  { label: "Transaksi", href: "/transactions", icon: ClipboardList },
  { label: "Kategori", href: "/categories", icon: FolderTree, adminOnly: true },
  { label: "Akun kasir", href: "/cashier-accounts", icon: UserPlus, adminOnly: true },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/login": "Masuk",
  "/products": "Produk",
  "/cashier": "Kasir",
  "/transactions": "Riwayat transaksi",
  "/categories": "Kategori",
  "/cashier-accounts": "Akun kasir",
};

function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = `${pageTitles[pathname] ?? "Halaman tidak ditemukan"} | StokPintar`;
  }, [pathname]);

  return null;
}

function Sidebar({
  user,
  onNavigate,
  onLogout,
}: {
  user: User | null;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  // Menu khusus admin tidak ditampilkan untuk akun kasir.
  const items = navigation.filter((item) => !item.adminOnly || user?.role === "ADMIN");

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-[76px] items-center gap-3 px-6">
        <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <Store className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="font-semibold tracking-tight text-slate-900">StokPintar</p>
          <p className="text-xs text-muted-foreground">Manajemen toko</p>
        </div>
      </div>

      <Separator />

      <nav aria-label="Navigasi utama" className="flex-1 space-y-1 px-3 py-6">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Menu</p>
        {items.map(({ label, href, icon: Icon }) => (
          <NavLink
            key={href}
            to={href}
            end={href === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto p-3">
        <Separator className="mb-3" />
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{user?.name || "Pengguna"}</p>
            <p className="text-xs text-muted-foreground">{user?.role === "ADMIN" ? "Administrator" : "Kasir"}</p>
          </div>
        </div>
        <Button variant="ghost" className="mt-1 w-full justify-start text-slate-600 hover:text-red-600" onClick={onLogout}>
          <LogOut className="size-4" aria-hidden="true" />
          Keluar
        </Button>
      </div>
    </div>
  );
}

function AdminRoute({ children }: { children: ReactNode }) {
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User | null;
  return user?.role === "ADMIN" ? children : <Navigate to="/" replace />;
}

function Layout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User | null;

  if (!token) return <Navigate to="/login" replace />;

  function logout() {
    localStorage.clear();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-white md:block">
        <Sidebar user={user} onLogout={logout} />
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white/95 px-4 backdrop-blur md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Buka menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <DialogTitle className="sr-only">Menu StokPintar</DialogTitle>
              <Sidebar user={user} onNavigate={() => setMenuOpen(false)} onLogout={logout} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold tracking-tight text-slate-900">StokPintar</span>
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PageTitle />
      <Toaster />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/cashier" element={<Cashier />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<AdminRoute><Categories /></AdminRoute>} />
          <Route path="/cashier-accounts" element={<AdminRoute><CashierAccounts /></AdminRoute>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
