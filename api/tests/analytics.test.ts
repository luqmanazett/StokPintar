import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createProduct, createUser, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("analitik penjualan", () => {
  it("membandingkan periode setara dan merinci metode pembayaran serta kinerja kasir", async () => {
    const { user: admin } = await createUser("ADMIN");
    const { user: manager } = await createUser("MANAJER");
    const { user: cashierOne } = await createUser("KASIR", { name: "Kasir Satu" });
    const { user: cashierTwo } = await createUser("KASIR", { name: "Kasir Dua" });
    const adminToken = await loginToken(admin.email);
    const managerToken = await loginToken(manager.email);
    const { user: warehouse } = await createUser("GUDANG");
    const product = await createProduct(20, warehouse.id);
    await prisma.product.update({ where: { id: product.id }, data: { costPrice: 100, sellPrice: 500 } });

    const now = Date.now();
    const from = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(now);
    const previousDate = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    const currentDate = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    await createSale(cashierOne.id, product.id, 2, 1000, "CASH", previousDate);
    await prisma.expense.create({
      data: { category: "Sewa", amount: 100, incurredAt: previousDate, createdById: admin.id },
    });
    await createSale(cashierOne.id, product.id, 2, 1000, "CASH", currentDate);
    await createSale(cashierTwo.id, product.id, 1, 500, "QRIS", currentDate);
    await prisma.expense.create({
      data: { category: "Listrik", amount: 50, incurredAt: currentDate, createdById: manager.id },
    });

    const response = await request(app).get("/api/reports/analytics")
      .query({ from: from.toISOString(), to: to.toISOString() })
      .set(auth(managerToken))
      .expect(200);
    expect(response.body).toMatchObject({
      current: { transactions: 2, revenue: 1500, cost: 300, expenses: 50, profit: 1150 },
      previous: { transactions: 1, revenue: 1000, cost: 200, expenses: 100, profit: 700 },
      changes: { transactions: 100, revenue: 50, profit: 64.3 },
      expensesByCategory: [{ category: "Listrik", amount: 50 }],
    });
    expect(response.body.paymentMethods).toEqual([
      { paymentMethod: "CASH", transactions: 1, revenue: 1000 },
      { paymentMethod: "QRIS", transactions: 1, revenue: 500 },
    ]);
    expect(response.body.cashiers).toEqual([
      { cashierId: cashierOne.id, name: "Kasir Satu", transactions: 1, revenue: 1000 },
      { cashierId: cashierTwo.id, name: "Kasir Dua", transactions: 1, revenue: 500 },
    ]);

    const adminResponse = await request(app).get("/api/reports/analytics")
      .query({ from: from.toISOString(), to: to.toISOString() })
      .set(auth(adminToken))
      .expect(200);
    expect(adminResponse.body.current.profit).toBe(1150);
  });

  it("menolak rentang terbalik dan peran yang tidak mendapat akses laporan", async () => {
    const { user: warehouse } = await createUser("GUDANG");
    const token = await loginToken(warehouse.email);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await request(app).get("/api/reports/analytics")
      .query({ from: yesterday.toISOString(), to: tomorrow.toISOString() })
      .set(auth(token))
      .expect(403);
    const { user: manager } = await createUser("MANAJER");
    const managerToken = await loginToken(manager.email);
    await request(app).get("/api/reports/analytics")
      .query({ from: tomorrow.toISOString(), to: yesterday.toISOString() })
      .set(auth(managerToken))
      .expect(400);
  });
});

async function createSale(
  cashierId: number,
  productId: number,
  quantity: number,
  total: number,
  paymentMethod: "CASH" | "TRANSFER" | "QRIS",
  createdAt: Date,
) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        cashierId,
        subtotal: quantity * product.sellPrice,
        discount: quantity * product.sellPrice - total,
        total,
        paymentMethod,
        createdAt,
        items: {
          create: [{ productId, quantity, unitPrice: product.sellPrice, unitCost: product.costPrice }],
        },
      },
      include: { items: true },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        type: "SALE",
        change: -quantity,
        saleId: sale.id,
        createdById: cashierId,
        createdAt,
      },
    });
    return sale;
  });
}

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
