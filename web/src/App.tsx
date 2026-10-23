import { BrowserRouter, Routes, Route, Navigate, Link, Outlet, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Cashier from "./pages/Cashier";

function Layout() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") ?? "null");

  if (!token) return <Navigate to="/login" replace />;

  function logout() {
    localStorage.clear();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center gap-4 bg-white px-6 py-3 shadow">
        <span className="font-bold">StokPintar</span>
        <Link to="/">Dashboard</Link>
        <Link to="/products">Produk</Link>
        <Link to="/cashier">Kasir</Link>
        <span className="ml-auto text-sm text-gray-500">
          {user?.name} ({user?.role})
        </span>
        <button onClick={logout} className="text-sm text-red-600">
          Keluar
        </button>
      </nav>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/cashier" element={<Cashier />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
