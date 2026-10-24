import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "./seed";
import { assertSafeDemoResetTarget } from "../src/services/demo-reset-safety";

const prisma = new PrismaClient();

async function main() {
  assertSafeDemoResetTarget();
  if (process.env.SEED_DEMO_CONFIRM !== "YES") {
    throw new Error("Untuk mereset data demo, atur SEED_DEMO_CONFIRM=YES terlebih dahulu.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.deleteMany();
    await tx.saleReturnItem.deleteMany();
    await tx.saleReturn.deleteMany();
    await tx.saleItem.deleteMany();
    await tx.sale.deleteMany();
    await tx.goodsReceiptItem.deleteMany();
    await tx.goodsReceipt.deleteMany();
    await tx.purchaseOrderItem.deleteMany();
    await tx.purchaseOrder.deleteMany();
    await tx.stockOpnameItem.deleteMany();
    await tx.stockOpname.deleteMany();
    await tx.expense.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.product.deleteMany();
    await tx.supplier.deleteMany();
    await tx.category.deleteMany();
    await tx.user.deleteMany();
    await seedDemo(tx);
  }, { timeout: 30_000 });

  console.info("Data demo berhasil direset dan disiapkan kembali.");
}

main()
  .catch((error: unknown) => {
    console.error("Reset data demo gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
