import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getStock } from "../services/stock";
import { audit } from "../services/audit";
import { notifyTelegramAfterCommit } from "../services/telegram";

const router = Router();

const saleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  discount: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["CASH", "TRANSFER", "QRIS"]),
});

router.post("/", requireAuth, requireRole("ADMIN", "KASIR"), async (req, res) => {
  const data = saleSchema.parse(req.body);

  // gabungkan baris yang produknya sama
  const qtyByProduct = new Map<number, number>();
  for (const item of data.items) {
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  const ids = [...qtyByProduct.keys()];

  const result = await prisma.$transaction(async (tx) => {
    // kunci baris produk supaya dua kasir tidak bisa menjual stok terakhir yang sama
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;

    const products = await tx.product.findMany({ where: { id: { in: ids }, isActive: true } });
    if (products.length !== ids.length) throw new AppError(400, "Ada produk yang tidak ditemukan");

    let subtotal = 0;
    const items = [];
    const lowStockAlerts: string[] = [];

    for (const product of products) {
      const quantity = qtyByProduct.get(product.id)!;
      const stock = await getStock(tx, product.id);

      if (stock < quantity) {
        throw new AppError(400, `Stok ${product.name} tidak cukup (sisa ${stock})`);
      }

      const remainingStock = stock - quantity;
      if (stock > product.minStock && remainingStock <= product.minStock) {
        lowStockAlerts.push(
          `Stok menipis: ${product.name} tersisa ${remainingStock} (batas minimum ${product.minStock}).`,
        );
      }

      subtotal += quantity * product.sellPrice;
      items.push({
        productId: product.id,
        quantity,
        unitPrice: product.sellPrice,
        unitCost: product.costPrice,
      });
    }

    if (data.discount > subtotal) throw new AppError(400, "Diskon melebihi subtotal");

    const created = await tx.sale.create({
      data: {
        cashierId: req.user!.id,
        subtotal,
        discount: data.discount,
        total: subtotal - data.discount,
        paymentMethod: data.paymentMethod,
        items: { create: items },
      },
      include: { items: true },
    });

    await tx.stockMovement.createMany({
      data: items.map((i) => ({
        productId: i.productId,
        type: "SALE" as const,
        change: -i.quantity,
        saleId: created.id,
        createdById: req.user!.id,
      })),
    });

    await audit(tx, {
      userId: req.user!.id,
      action: "SALE_CREATE",
      entity: "Sale",
      entityId: created.id,
      after: {
        subtotal: created.subtotal,
        discount: created.discount,
        total: created.total,
        paymentMethod: created.paymentMethod,
        items: items.map(({ productId, quantity, unitPrice, unitCost }) => ({
          productId,
          quantity,
          unitPrice,
          unitCost,
        })),
      },
      ip: req.ip,
    });

    return { sale: created, lowStockAlerts };
  });

  const notifications = [
    {
      text: `Penjualan #${result.sale.id} berhasil. Total ${new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(result.sale.total)}, metode ${result.sale.paymentMethod}.`,
      event: "penjualan",
    },
    ...result.lowStockAlerts.map((text) => ({ text, event: "stok menipis" })),
  ];
  await Promise.all(
    notifications.map(({ text, event }) => notifyTelegramAfterCommit(text, event)),
  );

  res.status(201).json(result.sale);
});

router.get("/", requireAuth, requireRole("ADMIN", "MANAJER", "KASIR"), async (req, res) => {
  const where: Prisma.SaleWhereInput = {};
  if (req.user!.role === "KASIR") where.cashierId = req.user!.id;

  const createdAt: Prisma.DateTimeFilter = {};
  if (req.query.from) createdAt.gte = new Date(String(req.query.from));
  if (req.query.to) createdAt.lte = new Date(String(req.query.to));
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

  res.json(
    await prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        cashier: { select: { name: true } },
        items: { include: { product: { select: { name: true } }, returns: { select: { quantity: true, refundAmount: true } } } },
      },
    }),
  );
});

router.post("/:id/void", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const id = Number(req.params.id);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${id} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) throw new AppError(404, "Transaksi tidak ditemukan");
    if (sale.status === "VOIDED") throw new AppError(409, "Transaksi sudah didatalkan");
    if (await tx.saleReturn.count({ where: { saleId: id } }) > 0) {
      throw new AppError(409, "Transaksi yang sudah memiliki retur tidak dapat dibatalkan");
    }

    await tx.sale.update({ where: { id }, data: { status: "VOIDED" } });

    await tx.stockMovement.createMany({
      data: sale.items.map((i) => ({
        productId: i.productId,
        type: "VOID" as const,
        change: i.quantity,
        saleId: id,
        createdById: req.user!.id,
        note: "Pembatalan transaksi",
      })),
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "SALE_VOID",
      entity: "Sale",
      entityId: id,
      before: { status: sale.status, total: sale.total },
      after: { status: "VOIDED", total: sale.total },
      ip: req.ip,
    });
  });

  res.json({ message: "Transaksi didatalkan" });
});

export default router;
