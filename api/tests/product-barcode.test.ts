import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createUser, resetDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("barcode produk", () => {
  it("menyimpan barcode unik dan menemukannya melalui pencarian produk", async () => {
    const { user: admin } = await createUser("ADMIN");
    const token = await loginToken(admin.email);
    const category = await prisma.category.create({ data: { name: "Minuman" } });
    const barcode = "8991234567890";

    const created = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sku: "MINUM-001",
        barcode,
        name: "Minuman Test",
        categoryId: category.id,
        costPrice: 5000,
        sellPrice: 7000,
        minStock: 5,
      })
      .expect(201);

    expect(created.body.barcode).toBe(barcode);
    const search = await request(app)
      .get(`/api/products?search=${barcode}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(search.body).toHaveLength(1);
    expect(search.body[0]).toMatchObject({ sku: "MINUM-001", barcode, name: "Minuman Test" });

    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sku: "MINUM-002",
        barcode,
        name: "Minuman Duplikat",
        categoryId: category.id,
        costPrice: 5000,
        sellPrice: 7000,
      })
      .expect(409);
  });

  it("mengizinkan produk lama tanpa barcode dan menghapus barcode saat diedit", async () => {
    const { user: admin } = await createUser("ADMIN");
    const token = await loginToken(admin.email);
    const category = await prisma.category.create({ data: { name: "Makanan" } });
    const product = await prisma.product.create({
      data: {
        sku: "MAKAN-001",
        barcode: "111222333",
        name: "Produk Lama",
        categoryId: category.id,
        costPrice: 1000,
        sellPrice: 1500,
      },
    });

    const response = await request(app)
      .put(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ barcode: null })
      .expect(200);

    expect(response.body.barcode).toBeNull();
  });
});

async function loginToken(email: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "password123" })
    .expect(200);
  return response.body.token as string;
}
