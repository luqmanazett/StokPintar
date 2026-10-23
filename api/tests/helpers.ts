import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db";

export async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.goodsReceiptItem.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.stockOpnameItem.deleteMany();
  await prisma.stockOpname.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(
  role: "ADMIN" | "MANAJER" | "GUDANG" | "KASIR" = "KASIR",
  values: { name?: string; email?: string; password?: string } = {},
) {
  const name = values.name ?? `${role} Test`;
  const email = values.email ?? `${role.toLowerCase()}-${randomUUID()}@example.test`;
  const password = values.password ?? "password123";
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  return { user, email, password };
}

export async function createProduct(stock: number, createdById: number) {
  const category = await prisma.category.create({
    data: { name: `Kategori ${randomUUID()}` },
  });
  const product = await prisma.product.create({
    data: {
      sku: `SKU-${randomUUID()}`,
      name: "Produk Test",
      categoryId: category.id,
      costPrice: 700,
      sellPrice: 1200,
    },
  });

  if (stock > 0) {
    await prisma.stockMovement.create({
      data: { productId: product.id, type: "IN", change: stock, createdById },
    });
  }

  return product;
}

export async function getStock(productId: number) {
  const result = await prisma.stockMovement.aggregate({
    where: { productId },
    _sum: { change: true },
  });
  return result._sum.change ?? 0;
}
