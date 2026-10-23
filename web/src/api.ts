const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(API + path, { ...options, headers });

  if (res.status === 401 && token && window.location.pathname !== "/login") {
    localStorage.clear();
    sessionStorage.setItem("stokpintar-session-ended", "true");
    window.location.assign("/login");
    throw new Error("Sesi berakhir");
  }

  const responseText = await res.text();
  let data: unknown = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText) as unknown;
    } catch {
      throw new Error(res.ok ? "Respons server tidak valid" : responseText);
    }
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "Terjadi kesalahan";
    throw new Error(message);
  }
  return data as T;
}

export const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
