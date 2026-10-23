import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const DEMO_SALE_DATE = new Date("2026-10-01T10:00:00.000Z");

export async function seedDemo(client: PrismaClient) {
  const accounts = [
    { name: "Admin Toko", email: "admin@stokpintar.test", password: "admin123", role: "ADMIN" as const },
    { name: "Manajer Toko", email: "manajer@stokpintar.test", password: "manajer123", role: "MANAJER" as const },
    { name: "Gudang Toko", email: "gudang@stokpintar.test", password: "gudang123", role: "GUDANG" as const },
    { name: "Kasir Toko", email: "kasir@stokpintar.test", password: "kasir123", role: "KASIR" as const },
  ];
  const users = new Map<string, { id: number }>();
  for (const account of accounts) {
    const user = await client.user.upsert({
      where: { email: account.email },
      update: {},
      create: {
        name: account.name,
        email: account.email,
        passwordHash: await bcrypt.hash(account.password, 10),
        role: account.role,
      },
      select: { id: true },
    });
    users.set(account.role, user);
  }
  const admin = users.get("ADMIN");
  const cashier = users.get("KASIR");
  if (!admin || !cashier) throw new Error("Akun demo admin dan kasir gagal disiapkan.");

  const drinkCategory = await client.category.upsert({
    where: { name: "Minuman" },
    update: {},
    create: { name: "Minuman" },
  });
  const snackCategory = await client.category.upsert({
    where: { name: "Makanan Ringan" },
    update: {},
    create: { name: "Makanan Ringan" },
  });
  const fixtures = [
    { sku: "MNM-001", name: "Teh Botol 450ml", categoryId: drinkCategory.id, costPrice: 3500, sellPrice: 5000, qty: 40 },
    { sku: "MNM-002", name: "Air Mineral 600ml", categoryId: drinkCategory.id, costPrice: 2000, sellPrice: 3500, qty: 60 },
    { sku: "SNK-001", name: "Keripik Singkong", categoryId: snackCategory.id, costPrice: 6000, sellPrice: 9000, qty: 25 },
    { sku: "SNK-002", name: "Biskuit Cokelat", categoryId: snackCategory.id, costPrice: 4500, sellPrice: 7000, qty: 3 },
  ];

  const products = new Map<string, { id: number; costPrice: number; sellPrice: number }>();
  for (const fixture of fixtures) {
    const product = await client.product.upsert({
      where: { sku: fixture.sku },
      update: {},
      create: {
        sku: fixture.sku,
        name: fixture.name,
        categoryId: fixture.categoryId,
        costPrice: fixture.costPrice,
        sellPrice: fixture.sellPrice,
      },
      select: { id: true, costPrice: true, sellPrice: true },
    });
    products.set(fixture.sku, product);
    if (await client.stockMovement.count({ where: { productId: product.id } }) === 0) {
      await client.stockMovement.create({
        data: {
          productId: product.id,
          type: "IN",
          change: fixture.qty,
          note: "Stok awal data demo",
          createdById: admin.id,
        },
      });
    }
  }

  const primarySupplier = await client.supplier.findFirst({ where: { name: "Demo Pemasok Utama" } });
  const supplier = primarySupplier ?? await client.supplier.create({
    data: { name: "Demo Pemasok Utama", phone: "081234567890", address: "Jakarta" },
  });
  const demoProduct = products.get("MNM-001");
  if (!demoProduct) throw new Error("Produk demo MNM-001 tidak berhasil disiapkan.");
  await client.purchaseOrder.upsert({
    where: { orderNumber: "PO-DEMO-0001" },
    update: {},
    create: {
      orderNumber: "PO-DEMO-0001",
      supplierId: supplier.id,
      createdById: admin.id,
      notes: "Contoh pesanan pembelian data demo",
      items: {
        create: [{ productId: demoProduct.id, qtyOrdered: 10, unitCost: demoProduct.costPrice }],
      },
    },
  });

  const expenseDate = new Date("2026-10-01T00:00:00.000Z");
  const demoExpense = await client.expense.findFirst({
    where: { category: "Operasional", description: "Contoh biaya utilitas toko", incurredAt: expenseDate },
  });
  if (!demoExpense) {
    await client.expense.create({
      data: {
        category: "Operasional",
        description: "Contoh biaya utilitas toko",
        amount: 150000,
        incurredAt: expenseDate,
        createdById: admin.id,
      },
    });
  }

  const demoSale = await client.sale.findFirst({
    where: { cashierId: cashier.id, createdAt: DEMO_SALE_DATE },
    select: { id: true },
  });
  const saleProduct = products.get("MNM-001");
  if (!saleProduct) throw new Error("Produk demo untuk transaksi tidak berhasil disiapkan.");
  const stock = await client.stockMovement.aggregate({
    where: { productId: saleProduct.id },
    _sum: { change: true },
  });
  if (!demoSale && (stock._sum.change ?? 0) >= 2) {
    await client.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          cashierId: cashier.id,
          subtotal: saleProduct.sellPrice * 2,
          discount: 0,
          total: saleProduct.sellPrice * 2,
          paymentMethod: "CASH",
          createdAt: DEMO_SALE_DATE,
          items: {
            create: [{
              productId: saleProduct.id,
              quantity: 2,
              unitPrice: saleProduct.sellPrice,
              unitCost: saleProduct.costPrice,
            }],
          },
        },
        include: { items: true },
      });
      await tx.stockMovement.create({
        data: {
          productId: saleProduct.id,
          type: "SALE",
          change: -2,
          saleId: sale.id,
          createdById: cashier.id,
          createdAt: DEMO_SALE_DATE,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: cashier.id,
          action: "SALE_CREATE",
          entity: "Sale",
          entityId: sale.id,
          after: {
            subtotal: sale.subtotal,
            discount: sale.discount,
            total: sale.total,
            items: sale.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          },
          createdAt: DEMO_SALE_DATE,
        },
      });
    });
  }
}

function assertDemoDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed demo tidak diizinkan pada NODE_ENV=production.");
  }
  if (process.env.SEED_DEMO_CONFIRM !== "YES") {
    throw new Error("Untuk menjalankan seed demo, atur SEED_DEMO_CONFIRM=YES terlebih dahulu.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL wajib diatur.");
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (databaseName !== "stokpintar" && databaseName !== "stokpintar_demo") {
    throw new Error('Seed demo hanya diizinkan pada database "stokpintar" atau "stokpintar_demo".');
  }
}

async function main() {
  assertDemoDatabase();
  const prisma = new PrismaClient();
  try {
    await seedDemo(prisma);
    console.log("Data demo StokPintar berhasil disiapkan. Ganti kata sandi akun demo sebelum penggunaan nyata.");
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error("Seed demo gagal:", error);
    process.exitCode = 1;
  });
}
