import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createProduct, createUser, getStock, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("retur penjualan", () => {
  it("menerima retur parsial, mengembalikan stok, dan menghitung refund diskon proporsional", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: cashier } = await createUser("KASIR");
    const managerToken = await loginToken(manager.email);
    const cashierToken = await loginToken(cashier.email);
    const product = await createProduct(5, cashier.id);
    await prisma.product.update({ where: { id: product.id }, data: { costPrice: 100, sellPrice: 200 } });
    const sale = await request(app)
      .post("/api/sales")
      .set(auth(cashierToken))
      .send({ items: [{ productId: product.id, quantity: 5 }], discount: 100, paymentMethod: "CASH" })
      .expect(201);
    const saleItemId = sale.body.items[0].id as number;

    await request(app).post(`/api/sales/${sale.body.id}/returns`)
      .set(auth(cashierToken))
      .send({ reason: "Barang tidak sesuai", items: [{ saleItemId, quantity: 1 }] })
      .expect(403);

    const firstReturn = await request(app).post(`/api/sales/${sale.body.id}/returns`)
      .set(auth(managerToken))
      .send({ reason: "Sebagian barang rusak", items: [{ saleItemId, quantity: 2 }] })
      .expect(201);
    expect(firstReturn.body.totalRefund).toBe(360);
    expect(await getStock(product.id)).toBe(2);

    const excessiveReturn = await request(app).post(`/api/sales/${sale.body.id}/returns`)
      .set(auth(managerToken))
      .send({ reason: "Retur berlebih", items: [{ saleItemId, quantity: 4 }] })
      .expect(400);
    expect(excessiveReturn.body.error).toContain("melebihi sisa");
    expect(await getStock(product.id)).toBe(2);

    const secondReturn = await request(app).post(`/api/sales/${sale.body.id}/returns`)
      .set(auth(managerToken))
      .send({ reason: "Sisa barang dikembalikan", items: [{ saleItemId, quantity: 3 }] })
      .expect(201);
    expect(secondReturn.body.totalRefund).toBe(540);
    expect(await getStock(product.id)).toBe(5);
    expect(await prisma.saleReturn.aggregate({ _sum: { totalRefund: true } })).toMatchObject({ _sum: { totalRefund: 900 } });
    expect(await prisma.auditLog.count({ where: { action: "SALE_RETURN_CREATE" } })).toBe(2);
    await request(app).post(`/api/sales/${sale.body.id}/void`).set(auth(managerToken)).expect(409);
  });

  it("mengoreksi pendapatan, HPP, grafik harian, dan produk terlaris", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: cashier } = await createUser("KASIR");
    const managerToken = await loginToken(manager.email);
    const cashierToken = await loginToken(cashier.email);
    const product = await createProduct(5, cashier.id);
    await prisma.product.update({ where: { id: product.id }, data: { costPrice: 100, sellPrice: 200 } });
    const sale = await request(app)
      .post("/api/sales")
      .set(auth(cashierToken))
      .send({ items: [{ productId: product.id, quantity: 5 }], discount: 100, paymentMethod: "TRANSFER" })
      .expect(201);
    await request(app).post(`/api/sales/${sale.body.id}/returns`)
      .set(auth(managerToken))
      .send({ reason: "Retur sebagian", items: [{ saleItemId: sale.body.items[0].id, quantity: 2 }] })
      .expect(201);

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const summary = await request(app).get("/api/reports/summary").query({ from, to }).set(auth(managerToken)).expect(200);
    expect(summary.body).toMatchObject({ transactions: 1, grossRevenue: 900, refunds: 360, revenue: 540, profit: 240 });

    const daily = await request(app).get("/api/reports/daily").query({ from, to }).set(auth(managerToken)).expect(200);
    expect(daily.body.reduce((total: number, day: { revenue: number }) => total + day.revenue, 0)).toBe(540);
    const topProducts = await request(app).get("/api/reports/top-products").query({ from, to }).set(auth(managerToken)).expect(200);
    expect(topProducts.body).toContainEqual({ name: "Produk Test", quantity: 3, revenue: 540 });
  });

  it("hanya menerima retur untuk transaksi yang selesai dan menolak input yang tidak valid", async () => {
    const { user: admin } = await createUser("ADMIN");
    const { user: cashier } = await createUser("KASIR");
    const adminToken = await loginToken(admin.email);
    const cashierToken = await loginToken(cashier.email);
    const product = await createProduct(1, cashier.id);
    const sale = await request(app).post("/api/sales").set(auth(cashierToken))
      .send({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: "QRIS" }).expect(201);

    await request(app).post(`/api/sales/${sale.body.id}/returns`).set(auth(adminToken))
      .send({ reason: "x", items: [{ saleItemId: sale.body.items[0].id, quantity: 1 }] }).expect(400);
    await request(app).post(`/api/sales/${sale.body.id}/void`).set(auth(adminToken)).expect(200);
    await request(app).post(`/api/sales/${sale.body.id}/returns`).set(auth(adminToken))
      .send({ reason: "Transaksi void", items: [{ saleItemId: sale.body.items[0].id, quantity: 1 }] }).expect(409);
  });
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function loginToken(email: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "password123" })
    .expect(200);
  return response.body.token as string;
}
