import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createProduct, createUser, getStock, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("stok opname", () => {
  it("mencatat selisih positif dan negatif saat finalisasi", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: warehouse } = await createUser("GUDANG");
    const managerToken = await loginToken(manager.email);
    const warehouseToken = await loginToken(warehouse.email);
    const productA = await createProduct(10, warehouse.id);
    const productB = await createProduct(5, warehouse.id);
    const opname = await createOpname(warehouseToken);

    await request(app)
      .put(`/api/stock-opnames/${opname.body.id}/items`)
      .set(auth(warehouseToken))
      .send({ items: [{ productId: productA.id, countedQty: 12 }, { productId: productB.id, countedQty: 3 }] })
      .expect(200);
    const finalized = await request(app)
      .post(`/api/stock-opnames/${opname.body.id}/finalize`)
      .set(auth(managerToken))
      .expect(200);

    expect(finalized.body.opname.status).toBe("FINALIZED");
    expect(await getStock(productA.id)).toBe(12);
    expect(await getStock(productB.id)).toBe(3);
    expect(finalized.body.opname.items.map((item: { difference: number }) => item.difference).sort()).toEqual([-2, 2]);
    const movements = await prisma.stockMovement.findMany({ where: { stockOpnameId: opname.body.id } });
    expect(movements.map((movement) => movement.change).sort((a, b) => a - b)).toEqual([-2, 2]);
    expect(movements.every((movement) => movement.type === "OPNAME")).toBe(true);
  });

  it("menghitung selisih terhadap stok terkini dan mengembalikan peringatan snapshot", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: warehouse } = await createUser("GUDANG");
    const managerToken = await loginToken(manager.email);
    const warehouseToken = await loginToken(warehouse.email);
    const product = await createProduct(4, warehouse.id);
    const opname = await createOpname(warehouseToken);

    await prisma.stockMovement.create({
      data: { productId: product.id, type: "IN", change: 3, createdById: warehouse.id, note: "Stok masuk setelah snapshot" },
    });
    await request(app)
      .put(`/api/stock-opnames/${opname.body.id}/items`)
      .set(auth(warehouseToken))
      .send({ items: [{ productId: product.id, countedQty: 6 }] })
      .expect(200);
    const finalized = await request(app)
      .post(`/api/stock-opnames/${opname.body.id}/finalize`)
      .set(auth(managerToken))
      .expect(200);

    expect(await getStock(product.id)).toBe(6);
    expect(finalized.body.warnings).toEqual([{
      productId: product.id,
      productName: product.name,
      snapshotQty: 4,
      currentQty: 7,
      countedQty: 6,
    }]);
    expect(finalized.body.opname.items[0].difference).toBe(-1);
  });

  it("menolak finalisasi sebelum semua hitungan diisi dan menolak finalisasi kedua", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: warehouse } = await createUser("GUDANG");
    const managerToken = await loginToken(manager.email);
    const warehouseToken = await loginToken(warehouse.email);
    const product = await createProduct(2, warehouse.id);
    const opname = await createOpname(warehouseToken);

    await request(app).post(`/api/stock-opnames/${opname.body.id}/finalize`).set(auth(managerToken)).expect(400);
    await request(app)
      .put(`/api/stock-opnames/${opname.body.id}/items`)
      .set(auth(warehouseToken))
      .send({ items: [{ productId: product.id, countedQty: 2 }] })
      .expect(200);
    await request(app).post(`/api/stock-opnames/${opname.body.id}/finalize`).set(auth(managerToken)).expect(200);
    await request(app).post(`/api/stock-opnames/${opname.body.id}/finalize`).set(auth(managerToken)).expect(409);
    await request(app)
      .put(`/api/stock-opnames/${opname.body.id}/items`)
      .set(auth(warehouseToken))
      .send({ items: [{ productId: product.id, countedQty: 3 }] })
      .expect(409);
  });

  it("mengizinkan gudang membuat dan mengisi opname tetapi hanya manajer/admin memfinalisasi", async () => {
    const { user: admin } = await createUser("ADMIN");
    const { user: warehouse } = await createUser("GUDANG");
    const { user: cashier } = await createUser("KASIR");
    const adminToken = await loginToken(admin.email);
    const warehouseToken = await loginToken(warehouse.email);
    const cashierToken = await loginToken(cashier.email);
    const product = await createProduct(1, warehouse.id);
    const opname = await createOpname(warehouseToken);

    await request(app).post("/api/stock-opnames").set(auth(cashierToken)).send({}).expect(403);
    await request(app)
      .put(`/api/stock-opnames/${opname.body.id}/items`)
      .set(auth(warehouseToken))
      .send({ items: [{ productId: product.id, countedQty: 1 }] })
      .expect(200);
    await request(app).post(`/api/stock-opnames/${opname.body.id}/finalize`).set(auth(warehouseToken)).expect(403);
    await request(app).post(`/api/stock-opnames/${opname.body.id}/finalize`).set(auth(adminToken)).expect(200);
  });
});

async function createOpname(token: string) {
  return request(app).post("/api/stock-opnames").set(auth(token)).send({ notes: "Hitung fisik" }).expect(201);
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
