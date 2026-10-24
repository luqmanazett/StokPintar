import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { runIntegrityChecks } from "../src/services/integrity";
import { seedDemo } from "../prisma/seed";
import { createProduct, createUser, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("integritas data dan seed demo", () => {
  it("menyediakan hasil pemeriksaan hanya untuk admin dan tidak mengubah data", async () => {
    const { user: admin } = await createUser("ADMIN");
    const { user: manager } = await createUser("MANAJER");
    const adminToken = await loginToken(admin.email);
    const managerToken = await loginToken(manager.email);
    const category = await prisma.category.create({ data: { name: "Kategori integritas" } });
    const product = await prisma.product.create({
      data: {
        sku: "CHECK-001",
        name: "Produk pemeriksaan",
        categoryId: category.id,
        costPrice: 100,
        sellPrice: 200,
      },
    });
    await prisma.stockMovement.create({
      data: { productId: product.id, type: "IN", change: 4, createdById: admin.id },
    });
    const movementCount = await prisma.stockMovement.count();

    await request(app).get("/api/integrity/check").set(auth(managerToken)).expect(403);
    const response = await request(app).get("/api/integrity/check").set(auth(adminToken)).expect(200);
    expect(response.body.passed).toBe(true);
    expect(response.body.checks).toHaveLength(5);
    expect(response.body.checks.every((check: { passed: boolean }) => check.passed)).toBe(true);
    expect(await prisma.stockMovement.count()).toBe(movementCount);
  });

  it("menemukan saldo stok negatif dan melaporkan hasil gagal", async () => {
    const { user: admin } = await createUser("ADMIN");
    const token = await loginToken(admin.email);
    const product = await createProduct(0, admin.id);
    await prisma.stockMovement.create({
      data: { productId: product.id, type: "ADJUSTMENT", change: -1, createdById: admin.id },
    });

    const response = await request(app).get("/api/integrity/check").set(auth(token)).expect(200);
    const stockCheck = response.body.checks.find((check: { id: string }) => check.id === "stock-ledger");
    expect(response.body.passed).toBe(false);
    expect(stockCheck).toMatchObject({ passed: false, issueCount: 1 });
    expect(stockCheck.issues[0]).toContain(product.sku);
  });

  it("menyiapkan data demo secara idempoten dan menjaga ledger konsisten", async () => {
    await seedDemo(prisma);
    const countsAfterFirstRun = {
      users: await prisma.user.count(),
      products: await prisma.product.count(),
      movements: await prisma.stockMovement.count(),
      orders: await prisma.purchaseOrder.count(),
      expenses: await prisma.expense.count(),
      sales: await prisma.sale.count(),
    };

    await seedDemo(prisma);
    const countsAfterSecondRun = {
      users: await prisma.user.count(),
      products: await prisma.product.count(),
      movements: await prisma.stockMovement.count(),
      orders: await prisma.purchaseOrder.count(),
      expenses: await prisma.expense.count(),
      sales: await prisma.sale.count(),
    };

    expect(countsAfterSecondRun).toEqual(countsAfterFirstRun);
    expect(countsAfterFirstRun).toMatchObject({ users: 4, products: 4, movements: 5, orders: 1, expenses: 1, sales: 1 });
    expect((await runIntegrityChecks()).every((check) => check.passed)).toBe(true);
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
