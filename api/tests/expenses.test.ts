import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createProduct, createUser, getStock, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("pengeluaran dan laporan laba-rugi", () => {
  it("mencatat pengeluaran dan mengurangi laba bersih setelah retur", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: cashier } = await createUser("KASIR");
    const managerToken = await loginToken(manager.email);
    const cashierToken = await loginToken(cashier.email);
    const product = await createProduct(2, cashier.id);
    await prisma.product.update({ where: { id: product.id }, data: { costPrice: 100, sellPrice: 200 } });
    const sale = await request(app).post("/api/sales").set(auth(cashierToken))
      .send({ items: [{ productId: product.id, quantity: 2 }], discount: 50, paymentMethod: "CASH" })
      .expect(201);
    await request(app).post(`/api/sales/${sale.body.id}/returns`).set(auth(managerToken))
      .send({ reason: "Barang dikembalikan", items: [{ saleItemId: sale.body.items[0].id, quantity: 1 }] })
      .expect(201);

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const created = await request(app).post("/api/expenses").set(auth(managerToken)).send({
      category: "Operasional",
      description: "Biaya listrik",
      amount: 25,
      incurredAt: new Date().toISOString(),
    }).expect(201);
    expect(created.body).toMatchObject({
      category: "Operasional",
      description: "Biaya listrik",
      amount: 25,
      createdBy: { id: manager.id, name: manager.name },
    });

    const report = await request(app).get("/api/reports/profit-loss")
      .query({ from: from.toISOString(), to: to.toISOString() })
      .set(auth(managerToken))
      .expect(200);
    expect(report.body).toMatchObject({
      transactions: 1,
      grossRevenue: 350,
      refunds: 175,
      revenue: 175,
      cost: 100,
      expenses: 25,
      profit: 50,
      expensesByCategory: [{ category: "Operasional", amount: 25 }],
    });
    const dashboardSummary = await request(app).get("/api/reports/summary")
      .query({ from: from.toISOString(), to: to.toISOString() })
      .set(auth(managerToken))
      .expect(200);
    expect(dashboardSummary.body).toMatchObject({ transactions: 1, revenue: 175, profit: 50, expenses: 25 });
    expect(await getStock(product.id)).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "EXPENSE_CREATE" } })).toBe(1);
  });

  it("memfilter daftar pengeluaran berdasarkan periode dan menolak input tidak valid", async () => {
    const { user: admin } = await createUser("ADMIN");
    const token = await loginToken(admin.email);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.expense.create({
      data: { category: "Sewa", amount: 100, incurredAt: yesterday, createdById: admin.id },
    });
    await prisma.expense.create({
      data: { category: "Transportasi", amount: 50, incurredAt: new Date(), createdById: admin.id },
    });

    const response = await request(app).get("/api/expenses")
      .query({ from: new Date(Date.now() - 60 * 60 * 1000).toISOString(), to: tomorrow.toISOString() })
      .set(auth(token))
      .expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].category).toBe("Transportasi");

    await request(app).post("/api/expenses").set(auth(token)).send({
      category: " ",
      amount: 0,
      incurredAt: "invalid-date",
    }).expect(400);
    await request(app).get("/api/expenses")
      .query({ from: tomorrow.toISOString(), to: yesterday.toISOString() })
      .set(auth(token))
      .expect(400);
  });

  it("membatasi pengeluaran dan laporan ke ADMIN serta MANAJER", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: warehouse } = await createUser("GUDANG");
    const { user: cashier } = await createUser("KASIR");
    const managerToken = await loginToken(manager.email);
    const warehouseToken = await loginToken(warehouse.email);
    const cashierToken = await loginToken(cashier.email);
    const input = { category: "Utilitas", amount: 10, incurredAt: new Date().toISOString() };

    await request(app).post("/api/expenses").set(auth(managerToken)).send(input).expect(201);
    await request(app).post("/api/expenses").set(auth(warehouseToken)).send(input).expect(403);
    await request(app).get("/api/expenses").set(auth(cashierToken)).expect(403);
    await request(app).get("/api/reports/profit-loss")
      .query({ from: new Date(Date.now() - 1000).toISOString(), to: new Date(Date.now() + 1000).toISOString() })
      .set(auth(cashierToken))
      .expect(403);
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
