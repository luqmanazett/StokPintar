const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Terjadi kesalahan");
  return data as T;
}

export const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
