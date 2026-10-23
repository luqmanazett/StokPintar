import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const [email, setEmail] = useState("admin@stokpintar.test");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const data = await api<{ token: string; user: object }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="w-80 space-y-3 rounded bg-white p-6 shadow">
        <h1 className="text-xl font-bold">Masuk ke StokPintar</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <input className="w-full rounded border px-2 py-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input className="w-full rounded border px-2 py-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button className="w-full rounded bg-blue-600 py-2 text-white">Masuk</button>
      </form>
    </div>
  );
}
