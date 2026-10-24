import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
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
  ScrollText,
  Truck,
  PackageCheck,
  ClipboardCheck,
  UserPlus,
  ChartNoAxesCombined,
  ShieldCheck,
  Activity,
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
import Landing from "./pages/Landing";
import Products from "./pages/Products";
import Transactions from "./pages/Transactions";
import Categories from "./pages/Categories";
import CashierAccounts from "./pages/CashierAccounts";
import AuditLogs from "./pages/AuditLogs";
import Suppliers from "./pages/Suppliers";
import PurchaseOrders from "./pages/PurchaseOrders";
import StockOpnames from "./pages/StockOpnames";
import Finance from "./pages/Finance";
const Integrity = lazy(() => import("./pages/Integrity"));
const Analytics = lazy(() => import("./pages/Analytics"));
import NotFound from "./pages/NotFound";

type Role = "ADMIN" | "MANAJER" | "GUDANG" | "KASIR";

type User = {
  name?: string;
  role?: Role;
};

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
};

const navigation: NavigationItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Produk", href: "/products", icon: Package },
  { label: "Kasir", href: "/cashier", icon: ShoppingCart, roles: ["ADMIN", "KASIR"] },
  { label: "Transaksi", href: "/transactions", icon: ClipboardList, roles: ["ADMIN", "MANAJER", "KASIR"] },
  { label: "Kategori", href: "/categories", icon: FolderTree, roles: ["ADMIN"] },
  { label: "Akun", href: "/cashier-accounts", icon: UserPlus, roles: ["ADMIN"] },
  { label: "Log audit", href: "/audit-logs", icon: ScrollText, roles: ["ADMIN"] },
  { label: "Pemasok", href: "/suppliers", icon: Truck, roles: ["ADMIN", "MANAJER"] },
  { label: "Pembelian", href: "/purchases", icon: PackageCheck, roles: ["ADMIN", "MANAJER", "GUDANG"] },
  { label: "Stok opname", href: "/stock-opnames", icon: ClipboardCheck, roles: ["ADMIN", "MANAJER", "GUDANG"] },
  { label: "Keuangan", href: "/finance", icon: ChartNoAxesCombined, roles: ["ADMIN", "MANAJER"] },
  { label: "Analitik", href: "/analytics", icon: Activity, roles: ["ADMIN", "MANAJER"] },
  { label: "Integritas data", href: "/integrity", icon: ShieldCheck, roles: ["ADMIN"] },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/login": "Masuk",
  "/products": "Produk",
  "/cashier": "Kasir",
  "/transactions": "Riwayat transaksi",
  "/categories": "Kategori",
  "/cashier-accounts": "Akun pengguna",
  "/audit-logs": "Log audit",
  "/suppliers": "Pemasok",
  "/purchases": "Pembelian",
  "/stock-opnames": "Stok opname",
  "/finance": "Keuangan",
  "/analytics": "Analitik",
  "/integrity": "Integritas data",
};

function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const title = pathname === "/" && !localStorage.getItem("token")
      ? "Beranda"
      : pageTitles[pathname] ?? "Halaman tidak ditemukan";
    document.title = `${title} | StokPintar`;
  }, [pathname]);

  return null;
}

function DemoBanner() {
  if (!import.meta.env.VITE_DEMO_MODE) return null;
  return (
    <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900" role="status">
      Mode demo: data direset tiap malam pukul 03.00 WIB
    </div>
  );
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
  const items = navigation.filter((item) => !item.roles || (user?.role && item.roles.includes(user.role)));
  const roleLabels: Record<Role, string> = {
    ADMIN: "Administrator",
    MANAJER: "Manajer",
    GUDANG: "Gudang",
    KASIR: "Kasir",
  };

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
            <p className="text-xs text-muted-foreground">{user?.role ? roleLabels[user.role] : "Pengguna"}</p>
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

function HomeRoute() {
  return localStorage.getItem("token") ? <Layout /> : <Landing />;
}

function RoleRoute({ children, roles }: { children: ReactNode; roles: Role[] }) {
  const user = JSON.parse(localStorage.getItem("user") ?? "null") as User | null;
  return user?.role && roles.includes(user.role) ? children : <Navigate to="/" replace />;
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
      <DemoBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<HomeRoute />}>
          <Route index element={<Dashboard />} />
        </Route>
        <Route element={<Layout />}>
          <Route path="/products" element={<Products />} />
          <Route path="/cashier" element={<RoleRoute roles={["ADMIN", "KASIR"]}><Cashier /></RoleRoute>} />
          <Route path="/transactions" element={<RoleRoute roles={["ADMIN", "MANAJER", "KASIR"]}><Transactions /></RoleRoute>} />
          <Route path="/categories" element={<RoleRoute roles={["ADMIN"]}><Categories /></RoleRoute>} />
          <Route path="/cashier-accounts" element={<RoleRoute roles={["ADMIN"]}><CashierAccounts /></RoleRoute>} />
          <Route path="/audit-logs" element={<RoleRoute roles={["ADMIN"]}><AuditLogs /></RoleRoute>} />
          <Route path="/suppliers" element={<RoleRoute roles={["ADMIN", "MANAJER"]}><Suppliers /></RoleRoute>} />
          <Route path="/purchases" element={<RoleRoute roles={["ADMIN", "MANAJER", "GUDANG"]}><PurchaseOrders /></RoleRoute>} />
          <Route path="/stock-opnames" element={<RoleRoute roles={["ADMIN", "MANAJER", "GUDANG"]}><StockOpnames /></RoleRoute>} />
          <Route path="/finance" element={<RoleRoute roles={["ADMIN", "MANAJER"]}><Finance /></RoleRoute>} />
          <Route path="/analytics" element={<RoleRoute roles={["ADMIN", "MANAJER"]}><Suspense fallback={<div className="text-sm text-muted-foreground">Memuat analitik...</div>}><Analytics /></Suspense></RoleRoute>} />
          <Route path="/integrity" element={<RoleRoute roles={["ADMIN"]}><Suspense fallback={<div className="text-sm text-muted-foreground">Memuat pemeriksaan integritas...</div>}><Integrity /></Suspense></RoleRoute>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
