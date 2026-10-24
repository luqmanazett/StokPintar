import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createUser, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("matriks peran", () => {
  it("memberi akses sesuai peran pada laporan, produk, stok, dan akun", async () => {
    const { user: admin } = await createUser("ADMIN");
    const { user: manager } = await createUser("MANAJER");
    const { user: warehouse } = await createUser("GUDANG");
    const { user: cashier } = await createUser("KASIR");
    const category = await prisma.category.create({ data: { name: "Kategori Akses" } });
    const adminToken = await loginToken(admin.email);
    const managerToken = await loginToken(manager.email);
    const warehouseToken = await loginToken(warehouse.email);
    const cashierToken = await loginToken(cashier.email);
    const reportQuery = "?from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z";
    const productInput = {
      sku: "AKSES-01",
      name: "Produk Akses",
      categoryId: category.id,
      costPrice: 100,
      sellPrice: 200,
    };

    await request(app).get(`/api/reports/summary${reportQuery}`).set(auth(managerToken)).expect(200);
    await request(app).get(`/api/reports/summary${reportQuery}`).set(auth(warehouseToken)).expect(403);
    await request(app).post("/api/products").set(auth(warehouseToken)).send(productInput).expect(201);
    await request(app).post("/api/products").set(auth(managerToken)).send({ ...productInput, sku: "AKSES-02" }).expect(403);
    await request(app).post("/api/products").set(auth(cashierToken)).send({ ...productInput, sku: "AKSES-03" }).expect(403);

    const product = await prisma.product.findUniqueOrThrow({ where: { sku: productInput.sku } });
    await request(app).post("/api/stock/in").set(auth(warehouseToken)).send({ productId: product.id, quantity: 4 }).expect(201);
    await request(app).post("/api/stock/in").set(auth(managerToken)).send({ productId: product.id, quantity: 1 }).expect(403);
    await request(app).post("/api/stock/in").set(auth(cashierToken)).send({ productId: product.id, quantity: 1 }).expect(403);
    await request(app).get("/api/auth/users").set(auth(adminToken)).expect(200);
    await request(app).get("/api/auth/users").set(auth(managerToken)).expect(403);
  });

  it("menerapkan perubahan status akun segera pada token yang masih berlaku", async () => {
    const { user: admin } = await createUser("ADMIN");
    const { user: cashier } = await createUser("KASIR");
    const adminToken = await loginToken(admin.email);
    const cashierToken = await loginToken(cashier.email);

    await request(app)
      .put(`/api/auth/users/${cashier.id}`)
      .set(auth(adminToken))
      .send({ isActive: false })
      .expect(200);
    await request(app).get("/api/products").set(auth(cashierToken)).expect(401);
  });
});

describe("jejak audit", () => {
  it("mencatat perubahan akun dan produk tanpa menyimpan kredensial", async () => {
    const { user: admin } = await createUser("ADMIN");
    const token = await loginToken(admin.email);
    const category = await prisma.category.create({ data: { name: "Kategori Audit" } });

    const createdUser = await request(app)
      .post("/api/auth/users")
      .set(auth(token))
      .send({ name: "Pengguna Baru", email: "pengguna-baru@example.test", password: "rahasia123", role: "GUDANG" })
      .expect(201);
    await request(app)
      .post("/api/products")
      .set(auth(token))
      .send({ sku: "AUDIT-01", name: "Produk Audit", categoryId: category.id, costPrice: 700, sellPrice: 900 })
      .expect(201);

    const logs = await prisma.auditLog.findMany({ orderBy: { id: "asc" } });
    expect(logs.map((log) => log.action)).toEqual(["USER_CREATE", "PRODUCT_CREATE"]);
    expect(JSON.stringify(logs)).not.toContain("rahasia123");
    expect(JSON.stringify(logs)).not.toContain("passwordHash");

    const response = await request(app).get("/api/audit-logs?entity=User&page=1&limit=10").set(auth(token)).expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].user).toMatchObject({ id: admin.id, email: admin.email });
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 10, total: 1 });
    expect(createdUser.body.role).toBe("GUDANG");
  });

  it("menolak akses log audit bagi peran non-admin", async () => {
    const { user } = await createUser("MANAJER");
    const token = await loginToken(user.email);
    await request(app).get("/api/audit-logs").set(auth(token)).expect(403);
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
