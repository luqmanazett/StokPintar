import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createProduct, createUser, getStock, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("API dan otorisasi", () => {
  it("melayani health check dan login dengan token yang dapat dipakai", async () => {
    const { email, password } = await createUser("KASIR");

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toEqual({ status: "ok" });

    const login = await request(app).post("/api/auth/login").send({ email, password }).expect(200);
    expect(login.body.user).toMatchObject({ email, role: "KASIR" });

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, role: "KASIR" });
  });

  it("menolak kasir membuat akun baru", async () => {
    const { user } = await createUser("KASIR");
    const token = await loginToken(user.email);

    await request(app)
      .post("/api/auth/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Kasir Baru", email: "baru@example.test", password: "password123" })
      .expect(403);
  });
});

describe("transaksi penjualan", () => {
  it("menghitung total, menyimpan snapshot harga, dan mengurangi stok", async () => {
    const { user: cashier } = await createUser("KASIR");
    const product = await createProduct(5, cashier.id);
    const token = await loginToken(cashier.email);

    const response = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ productId: product.id, quantity: 2 }],
        discount: 300,
        paymentMethod: "CASH",
      })
      .expect(201);

    expect(response.body).toMatchObject({ subtotal: 2400, discount: 300, total: 2100 });
    expect(response.body.items[0]).toMatchObject({
      productId: product.id,
      quantity: 2,
      unitPrice: 1200,
      unitCost: 700,
    });
    expect(await getStock(product.id)).toBe(3);
  });

  it("menolak penjualan yang melebihi stok tanpa membuat transaksi", async () => {
    const { user: cashier } = await createUser("KASIR");
    const product = await createProduct(1, cashier.id);
    const token = await loginToken(cashier.email);

    await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product.id, quantity: 2 }], paymentMethod: "CASH" })
      .expect(400);

    expect(await prisma.sale.count()).toBe(0);
    expect(await getStock(product.id)).toBe(1);
  });

  it("void transaksi hanya sekali dan mengembalikan stok", async () => {
    const { user: admin } = await createUser("ADMIN");
    const { user: cashier } = await createUser("KASIR");
    const product = await createProduct(4, admin.id);
    const cashierToken = await loginToken(cashier.email);
    const adminToken = await loginToken(admin.email);

    const sale = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ items: [{ productId: product.id, quantity: 3 }], paymentMethod: "QRIS" })
      .expect(201);
    expect(await getStock(product.id)).toBe(1);

    await request(app)
      .post(`/api/sales/${sale.body.id}/void`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(await getStock(product.id)).toBe(4);

    await request(app)
      .post(`/api/sales/${sale.body.id}/void`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(409);
    expect(await getStock(product.id)).toBe(4);
  });

  it("mengizinkan tepat satu dari dua penjualan yang bersaing atas stok terakhir", async () => {
    const { user: cashier } = await createUser("KASIR");
    const product = await createProduct(1, cashier.id);
    const token = await loginToken(cashier.email);
    const payload = {
      items: [{ productId: product.id, quantity: 1 }],
      paymentMethod: "TRANSFER",
    };

    const results = await Promise.all([
      request(app).post("/api/sales").set("Authorization", `Bearer ${token}`).send(payload),
      request(app).post("/api/sales").set("Authorization", `Bearer ${token}`).send(payload),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(await prisma.sale.count()).toBe(1);
    expect(await getStock(product.id)).toBe(0);
  });
});

async function loginToken(email: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "password123" })
    .expect(200);
  return response.body.token as string;
}
