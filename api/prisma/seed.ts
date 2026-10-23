import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@stokpintar.test" },
    update: {},
    create: {
      name: "Admin Toko",
      email: "admin@stokpintar.test",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "kasir@stokpintar.test" },
    update: {},
    create: {
      name: "Kasir Toko",
      email: "kasir@stokpintar.test",
      passwordHash: await bcrypt.hash("kasir123", 10),
      role: "KASIR",
    },
  });

  if ((await prisma.product.count()) === 0) {
    const minuman = await prisma.category.upsert({
      where: { name: "Minuman" },
      update: {},
      create: { name: "Minuman" },
    });
    const snack = await prisma.category.upsert({
      where: { name: "Makanan Ringan" },
      update: {},
      create: { name: "Makanan Ringan" },
    });

    const items = [
      { sku: "MNM-001", name: "Teh Botol 450ml", categoryId: minuman.id, costPrice: 3500, sellPrice: 5000, qty: 40 },
      { sku: "MNM-002", name: "Air Mineral 600ml", categoryId: minuman.id, costPrice: 2000, sellPrice: 3500, qty: 60 },
      { sku: "SNK-001", name: "Keripik Singkong", categoryId: snack.id, costPrice: 6000, sellPrice: 9000, qty: 25 },
      { sku: "SNK-002", name: "Biskuit Cokelat", categoryId: snack.id, costPrice: 4500, sellPrice: 7000, qty: 3 },
    ];

    for (const { qty, ...data } of items) {
      const product = await prisma.product.create({ data });
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          type: "IN",
          change: qty,
          note: "Stok awal",
          createdById: admin.id,
        },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
