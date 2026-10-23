import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db";
import { createApp } from "../src/app";
import { createProduct, createUser, getStock, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("purchase order dan penerimaan barang", () => {
  it("membuat, memperbarui, dan mengarsipkan pemasok tanpa menghapus riwayat", async () => {
    const { user } = await createUser("MANAJER");
    const token = await loginToken(user.email);
    const supplier = await createSupplier(token);

    const updated = await request(app)
      .put(`/api/suppliers/${supplier.id}`)
      .set(auth(token))
      .send({ name: "Pemasok Diperbarui", address: "Bandung" })
      .expect(200);
    expect(updated.body).toMatchObject({ name: "Pemasok Diperbarui", address: "Bandung", isActive: true });

    await request(app).delete(`/api/suppliers/${supplier.id}`).set(auth(token)).expect(200);
    const list = await request(app).get("/api/suppliers").set(auth(token)).expect(200);
    expect(list.body.find((entry: { id: number }) => entry.id === supplier.id).isActive).toBe(false);
  });

  it("mencatat penerimaan bertahap, menambah stok, dan menghitung rata-rata modal", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: warehouse } = await createUser("GUDANG");
    const managerToken = await loginToken(manager.email);
    const warehouseToken = await loginToken(warehouse.email);
    const supplier = await createSupplier(managerToken);
    const product = await createProduct(4, warehouse.id);
    await prisma.product.update({ where: { id: product.id }, data: { costPrice: 100 } });

    const order = await createOrder(managerToken, supplier.id, product.id, 10, 300);
    expect(order.body.orderNumber).toMatch(/^PO-\d{6}-0001$/);
    const itemId = order.body.items[0].id as number;

    const ordered = await request(app)
      .post(`/api/purchase-orders/${order.body.id}/order`)
      .set(auth(managerToken))
      .expect(200);
    expect(ordered.body.status).toBe("ORDERED");

    const firstReceipt = await request(app)
      .post(`/api/purchase-orders/${order.body.id}/receive`)
      .set(auth(warehouseToken))
      .send({ items: [{ purchaseOrderItemId: itemId, quantity: 5 }], note: "Penerimaan sebagian" })
      .expect(201);
    expect(firstReceipt.body.purchaseOrder.status).toBe("PARTIAL");
    expect(await getStock(product.id)).toBe(9);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).costPrice).toBe(211);

    const secondReceipt = await request(app)
      .post(`/api/purchase-orders/${order.body.id}/receive`)
      .set(auth(warehouseToken))
      .send({ items: [{ purchaseOrderItemId: itemId, quantity: 5 }], note: "Penerimaan akhir" })
      .expect(201);
    expect(secondReceipt.body.purchaseOrder.status).toBe("RECEIVED");
    expect(await getStock(product.id)).toBe(14);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).costPrice).toBe(243);

    const movements = await prisma.stockMovement.findMany({ where: { productId: product.id, type: "PURCHASE" } });
    expect(movements.map((movement) => movement.change)).toEqual([5, 5]);
    expect(movements.every((movement) => movement.goodsReceiptId !== null)).toBe(true);
  });

  it("menolak penerimaan yang melebihi sisa pesanan tanpa perubahan data", async () => {
    const { user: manager } = await createUser("MANAJER");
    const { user: warehouse } = await createUser("GUDANG");
    const managerToken = await loginToken(manager.email);
    const warehouseToken = await loginToken(warehouse.email);
    const supplier = await createSupplier(managerToken);
    const product = await createProduct(2, warehouse.id);
    const order = await createOrder(managerToken, supplier.id, product.id, 2, 450);
    await request(app).post(`/api/purchase-orders/${order.body.id}/order`).set(auth(managerToken)).expect(200);

    await request(app)
      .post(`/api/purchase-orders/${order.body.id}/receive`)
      .set(auth(warehouseToken))
      .send({ items: [{ purchaseOrderItemId: order.body.items[0].id, quantity: 3 }] })
      .expect(400);

    expect(await getStock(product.id)).toBe(2);
    expect(await prisma.goodsReceipt.count()).toBe(0);
    expect(await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: order.body.items[0].id } })).toMatchObject({ qtyReceived: 0 });
  });

  it("membatasi pembuatan PO untuk manajer/admin dan penerimaan untuk gudang/admin", async () => {
    const { user: admin } = await createUser("ADMIN");
    const { user: manager } = await createUser("MANAJER");
    const { user: warehouse } = await createUser("GUDANG");
    const { user: cashier } = await createUser("KASIR");
    const adminToken = await loginToken(admin.email);
    const managerToken = await loginToken(manager.email);
    const warehouseToken = await loginToken(warehouse.email);
    const cashierToken = await loginToken(cashier.email);
    const supplier = await createSupplier(managerToken);
    const product = await createProduct(0, admin.id);

    await request(app).post("/api/purchase-orders").set(auth(cashierToken)).send({
      supplierId: supplier.id,
      items: [{ productId: product.id, qtyOrdered: 1, unitCost: 200 }],
    }).expect(403);
    await request(app).post("/api/purchase-orders").set(auth(warehouseToken)).send({
      supplierId: supplier.id,
      items: [{ productId: product.id, qtyOrdered: 1, unitCost: 200 }],
    }).expect(403);

    const order = await createOrder(adminToken, supplier.id, product.id, 1, 200);
    await request(app).post(`/api/purchase-orders/${order.body.id}/order`).set(auth(managerToken)).expect(200);
    await request(app).post(`/api/purchase-orders/${order.body.id}/receive`)
      .set(auth(cashierToken))
      .send({ items: [{ purchaseOrderItemId: order.body.items[0].id, quantity: 1 }] })
      .expect(403);
    await request(app).post(`/api/purchase-orders/${order.body.id}/receive`)
      .set(auth(warehouseToken))
      .send({ items: [{ purchaseOrderItemId: order.body.items[0].id, quantity: 1 }] })
      .expect(201);
  });

  it("hanya dapat mengubah PO saat DRAFT dan membatalkan sebelum penerimaan", async () => {
    const { user: manager } = await createUser("MANAJER");
    const managerToken = await loginToken(manager.email);
    const supplier = await createSupplier(managerToken);
    const product = await createProduct(0, manager.id);
    const order = await createOrder(managerToken, supplier.id, product.id, 2, 100);

    await request(app).put(`/api/purchase-orders/${order.body.id}`)
      .set(auth(managerToken))
      .send({ notes: "Diperbarui" })
      .expect(200);
    await request(app).post(`/api/purchase-orders/${order.body.id}/order`).set(auth(managerToken)).expect(200);
    await request(app).put(`/api/purchase-orders/${order.body.id}`)
      .set(auth(managerToken))
      .send({ notes: "Tidak boleh diubah" })
      .expect(409);
    const cancelled = await request(app)
      .post(`/api/purchase-orders/${order.body.id}/cancel`)
      .set(auth(managerToken))
      .expect(200);
    expect(cancelled.body.status).toBe("CANCELLED");
  });
});

async function createSupplier(token: string) {
  const response = await request(app)
    .post("/api/suppliers")
    .set(auth(token))
    .send({ name: `Pemasok ${Date.now()}`, phone: "08123456789", address: "Jakarta" })
    .expect(201);
  return response.body as { id: number; name: string };
}

async function createOrder(token: string, supplierId: number, productId: number, qtyOrdered: number, unitCost: number) {
  return request(app)
    .post("/api/purchase-orders")
    .set(auth(token))
    .send({ supplierId, items: [{ productId, qtyOrdered, unitCost }] })
    .expect(201);
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
