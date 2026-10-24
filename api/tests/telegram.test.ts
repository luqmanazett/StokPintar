import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createProduct, createUser, getStock } from "./helpers";

const app = createApp();
const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
const originalChatId = process.env.TELEGRAM_CHAT_ID;

beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

afterEach(() => {
  restoreEnvironment("TELEGRAM_BOT_TOKEN", originalBotToken);
  restoreEnvironment("TELEGRAM_CHAT_ID", originalChatId);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifikasi Telegram", () => {
  it("mengizinkan admin menguji konfigurasi Telegram", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
    const telegramFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", telegramFetch);

    const { user } = await createUser("ADMIN");
    const token = await loginToken(user.email);
    const response = await request(app)
      .post("/api/notifications/telegram/test")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ message: "Pesan tes berhasil dikirim" });
    expect(telegramFetch).toHaveBeenCalledOnce();
    expect(String(telegramFetch.mock.calls[0]?.[0])).toContain("/bottest-token/sendMessage");
    expect(telegramFetch.mock.calls[0]?.[1]?.body).toContain("test-chat");
  });

  it("menolak tes tanpa konfigurasi dan untuk role selain admin", async () => {
    const { user: admin } = await createUser("ADMIN");
    const adminToken = await loginToken(admin.email);
    await request(app)
      .post("/api/notifications/telegram/test")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(503);

    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
    const { user: cashier } = await createUser("KASIR");
    const cashierToken = await loginToken(cashier.email);

    await request(app)
      .post("/api/notifications/telegram/test")
      .set("Authorization", `Bearer ${cashierToken}`)
      .expect(403);
  });

  it("mengirim pemberitahuan setelah transaksi dan tidak membatalkan penjualan jika Telegram gagal", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "test-chat";
    const { user: cashier } = await createUser("KASIR");
    const product = await createProduct(6, cashier.id);
    const token = await loginToken(cashier.email);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const telegramFetch = vi.fn(async () => {
      expect(await prisma.sale.count({ where: { cashierId: cashier.id } })).toBe(1);
      throw new Error("koneksi tidak tersedia");
    });
    vi.stubGlobal("fetch", telegramFetch);

    const response = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: "CASH" })
      .expect(201);

    expect(response.body.total).toBe(1200);
    expect(await getStock(product.id)).toBe(5);
    expect(telegramFetch).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledTimes(2);
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function loginToken(email: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "password123" })
    .expect(200);
  return response.body.token as string;
}
