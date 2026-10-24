import { Router } from "express";
import { PurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { audit } from "../services/audit";
import { getStock } from "../services/stock";

const router = Router();

const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  qtyOrdered: z.number().int().positive(),
  unitCost: z.number().int().min(0),
});
const uniqueProducts = (items: { productId: number }[]) => new Set(items.map((item) => item.productId)).size === items.length;
const createOrderSchema = z.object({
  supplierId: z.number().int().positive(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(orderItemSchema).min(1).max(100).refine(uniqueProducts, "Produk dalam pesanan tidak boleh berulang."),
});
const updateOrderSchema = z.object({
  supplierId: z.number().int().positive().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(orderItemSchema).min(1).max(100).refine(uniqueProducts, "Produk dalam pesanan tidak boleh berulang.").optional(),
}).refine((data) => Object.keys(data).length > 0, { message: "Minimal satu data pesanan harus diubah." });
const receiveSchema = z.object({
  note: z.string().trim().max(1000).optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })).min(1).max(100).refine(
    (items) => new Set(items.map((item) => item.purchaseOrderItemId)).size === items.length,
    "Baris penerimaan tidak boleh berulang.",
  ),
});
const statusSchema = z.enum(["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"]);
const includeOrder = {
  supplier: true,
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, sku: true, name: true, costPrice: true } } } },
  receipts: {
    orderBy: { createdAt: "desc" as const },
    include: { createdBy: { select: { id: true, name: true } }, items: true },
  },
};

router.get("/", requireAuth, requireRole("ADMIN", "MANAJER", "GUDANG"), async (req, res) => {
  const query = z.object({ status: statusSchema.optional() }).parse(req.query);
  res.json(await prisma.purchaseOrder.findMany({
    where: query.status ? { status: query.status } : undefined,
    orderBy: { createdAt: "desc" },
    include: includeOrder,
  }));
});

router.post("/", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const data = createOrderSchema.parse(req.body);
  const order = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, isActive: true } });
    if (!supplier) throw new AppError(404, "Pemasok aktif tidak ditemukan");
    const products = await tx.product.findMany({
      where: { id: { in: data.items.map((item) => item.productId) }, isActive: true },
      select: { id: true },
    });
    if (products.length !== data.items.length) throw new AppError(400, "Ada produk yang tidak ditemukan atau sudah diarsipkan");

    const monthStamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()).replace("-", "");
    const year = Number(monthStamp.slice(0, 4));
    const month = Number(monthStamp.slice(4, 6));
    // Kunci per bulan agar dua pesanan bersamaan tidak memakai nomor yang sama.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BigInt(year * 100 + month)})`;
    const prefix = `PO-${year}${String(month).padStart(2, "0")}-`;
    const latest = await tx.purchaseOrder.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const sequence = latest ? Number(latest.orderNumber.slice(-4)) + 1 : 1;
    if (sequence > 9999) throw new AppError(409, "Nomor pesanan bulan ini sudah mencapai batas.");
    const orderNumber = `${prefix}${String(sequence).padStart(4, "0")}`;

    const created = await tx.purchaseOrder.create({
      data: {
        orderNumber,
        supplierId: supplier.id,
        notes: data.notes,
        createdById: req.user!.id,
        items: { create: data.items },
      },
      include: includeOrder,
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "PURCHASE_ORDER_CREATE",
      entity: "PurchaseOrder",
      entityId: created.id,
      after: {
        orderNumber,
        supplierId: supplier.id,
        status: created.status,
        items: data.items.map((item) => ({ ...item })),
      },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(order);
});

router.get("/:id", requireAuth, requireRole("ADMIN", "MANAJER", "GUDANG"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: includeOrder });
  if (!order) throw new AppError(404, "Pesanan pembelian tidak ditemukan");
  res.json(order);
});

router.put("/:id", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const data = updateOrderSchema.parse(req.body);
  const order = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!before) throw new AppError(404, "Pesanan pembelian tidak ditemukan");
    if (before.status !== "DRAFT") throw new AppError(409, "Pesanan hanya dapat diubah saat berstatus DRAFT");
    if (data.supplierId !== undefined && !(await tx.supplier.findFirst({ where: { id: data.supplierId, isActive: true } }))) {
      throw new AppError(404, "Pemasok aktif tidak ditemukan");
    }
    if (data.items) {
      const products = await tx.product.findMany({
        where: { id: { in: data.items.map((item) => item.productId) }, isActive: true },
        select: { id: true },
      });
      if (products.length !== data.items.length) throw new AppError(400, "Ada produk yang tidak ditemukan atau sudah diarsipkan");
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderItem.createMany({
        data: data.items.map((item) => ({ ...item, purchaseOrderId: id })),
      });
    }
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: { supplierId: data.supplierId, notes: data.notes },
      include: includeOrder,
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "PURCHASE_ORDER_UPDATE",
      entity: "PurchaseOrder",
      entityId: id,
      before: { supplierId: before.supplierId, notes: before.notes, items: before.items.map((item) => ({ productId: item.productId, qtyOrdered: item.qtyOrdered, unitCost: item.unitCost })) },
      after: { supplierId: updated.supplierId, notes: updated.notes, items: updated.items.map((item) => ({ productId: item.productId, qtyOrdered: item.qtyOrdered, unitCost: item.unitCost })) },
      ip: req.ip,
    });
    return updated;
  });
  res.json(order);
});

router.post("/:id/order", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const order = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!before) throw new AppError(404, "Pesanan pembelian tidak ditemukan");
    if (before.status !== "DRAFT") throw new AppError(409, "Hanya pesanan DRAFT yang dapat dikirim");
    if (before.items.length === 0) throw new AppError(400, "Pesanan belum memiliki produk");
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: { status: "ORDERED", orderedAt: new Date() },
      include: includeOrder,
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "PURCHASE_ORDER_ORDER",
      entity: "PurchaseOrder",
      entityId: id,
      before: { status: before.status },
      after: { status: updated.status },
      ip: req.ip,
    });
    return updated;
  });
  res.json(order);
});

router.post("/:id/cancel", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const order = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.purchaseOrder.findUnique({ where: { id }, include: { receipts: { select: { id: true } } } });
    if (!before) throw new AppError(404, "Pesanan pembelian tidak ditemukan");
    if (before.status !== "DRAFT" && before.status !== "ORDERED") throw new AppError(409, "Pesanan ini tidak dapat dibatalkan");
    if (before.receipts.length > 0) throw new AppError(409, "Pesanan yang sudah menerima barang tidak dapat dibatalkan");
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: includeOrder,
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "PURCHASE_ORDER_CANCEL",
      entity: "PurchaseOrder",
      entityId: id,
      before: { status: before.status },
      after: { status: updated.status },
      ip: req.ip,
    });
    return updated;
  });
  res.json(order);
});

router.post("/:id/receive", requireAuth, requireRole("ADMIN", "GUDANG"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const data = receiveSchema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
    if (!order) throw new AppError(404, "Pesanan pembelian tidak ditemukan");
    if (order.status !== "ORDERED" && order.status !== "PARTIAL") {
      throw new AppError(409, "Barang hanya dapat diterima dari pesanan berstatus ORDERED atau PARTIAL");
    }

    const orderItems = new Map(order.items.map((item) => [item.id, item]));
    const lines = data.items.map((line) => {
      const item = orderItems.get(line.purchaseOrderItemId);
      if (!item) throw new AppError(400, "Baris barang tidak termasuk dalam pesanan ini");
      if (item.qtyReceived + line.quantity > item.qtyOrdered) {
        throw new AppError(400, `Jumlah penerimaan ${item.product.name} melebihi sisa pesanan`);
      }
      return { line, item };
    });

    const productIds = [...new Set(lines.map(({ item }) => item.productId))].sort((a, b) => a - b);
    for (const productId of productIds) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    }
    const receipt = await tx.goodsReceipt.create({
      data: {
        purchaseOrderId: id,
        createdById: req.user!.id,
        note: data.note,
        items: { create: lines.map(({ line }) => ({ purchaseOrderItemId: line.purchaseOrderItemId, quantity: line.quantity })) },
      },
      include: { items: true },
    });

    for (const { line, item } of lines) {
      const currentStock = await getStock(tx, item.productId);
      const newStock = currentStock + line.quantity;
      // Modal baru dihitung dari nilai stok lama dan barang yang baru diterima.
      const weightedCost = Math.round((currentStock * item.product.costPrice + line.quantity * item.unitCost) / newStock);
      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: { qtyReceived: item.qtyReceived + line.quantity },
      });
      await tx.product.update({ where: { id: item.productId }, data: { costPrice: weightedCost } });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "PURCHASE",
          change: line.quantity,
          note: data.note,
          createdById: req.user!.id,
          goodsReceiptId: receipt.id,
        },
      });
    }

    const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const status: PurchaseOrderStatus = refreshedItems.every((item) => item.qtyReceived === item.qtyOrdered)
      ? "RECEIVED"
      : "PARTIAL";
    const updatedOrder = await tx.purchaseOrder.update({ where: { id }, data: { status }, include: includeOrder });
    const receiptWithItems = await tx.goodsReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
      include: { items: true, createdBy: { select: { id: true, name: true } } },
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "PURCHASE_ORDER_RECEIVE",
      entity: "PurchaseOrder",
      entityId: id,
      before: { status: order.status, received: order.items.map((item) => ({ id: item.id, qtyReceived: item.qtyReceived })) },
      after: { status, receiptId: receipt.id, items: lines.map(({ line, item }) => ({ purchaseOrderItemId: item.id, quantity: line.quantity })) },
      ip: req.ip,
    });
    return { receipt: receiptWithItems, purchaseOrder: updatedOrder };
  });
  res.status(201).json(result);
});

export default router;
