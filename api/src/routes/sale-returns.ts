import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { audit } from "../services/audit";

const router = Router();
const returnSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  items: z.array(z.object({
    saleItemId: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })).min(1).max(100).refine(
    (items) => new Set(items.map((item) => item.saleItemId)).size === items.length,
    "Baris barang retur tidak boleh berulang.",
  ),
});

router.post("/:id/returns", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const saleId = z.coerce.number().int().positive().parse(req.params.id);
  const data = returnSchema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    if (!sale) throw new AppError(404, "Transaksi tidak ditemukan");
    if (sale.status !== "COMPLETED") throw new AppError(409, "Retur hanya dapat dibuat untuk transaksi yang selesai");

    const saleItemById = new Map(sale.items.map((item) => [item.id, item]));
    const existingReturns = await tx.saleReturnItem.findMany({
      where: { saleItem: { saleId } },
      select: { saleItemId: true, quantity: true },
    });
    const returnedByItem = new Map<number, number>();
    for (const item of existingReturns) {
      returnedByItem.set(item.saleItemId, (returnedByItem.get(item.saleItemId) ?? 0) + item.quantity);
    }

    const discountShares = allocateDiscount(sale.subtotal, sale.discount, sale.items);
    const calculated = data.items.map((requested) => {
      const saleItem = saleItemById.get(requested.saleItemId);
      if (!saleItem) throw new AppError(400, "Barang tidak termasuk dalam transaksi ini");
      const previouslyReturned = returnedByItem.get(saleItem.id) ?? 0;
      if (previouslyReturned + requested.quantity > saleItem.quantity) {
        throw new AppError(400, `Jumlah retur ${saleItem.id} melebihi sisa barang yang dapat diretur`);
      }
      const itemDiscount = discountShares.get(saleItem.id) ?? 0;
      // Pembagian kumulatif menjaga total diskon tetap tepat saat satu barang diretur bertahap.
      const quantity = BigInt(saleItem.quantity);
      const discountBefore = Number((BigInt(itemDiscount) * BigInt(previouslyReturned)) / quantity);
      const discountAfter = Number((BigInt(itemDiscount) * BigInt(previouslyReturned + requested.quantity)) / quantity);
      const refundAmount = requested.quantity * saleItem.unitPrice - (discountAfter - discountBefore);
      return { saleItem, quantity: requested.quantity, refundAmount };
    });

    const productIds = [...new Set(calculated.map(({ saleItem }) => saleItem.productId))].sort((a, b) => a - b);
    for (const productId of productIds) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    }

    const totalRefund = calculated.reduce((total, item) => total + item.refundAmount, 0);
    const created = await tx.saleReturn.create({
      data: {
        saleId,
        reason: data.reason,
        totalRefund,
        createdById: req.user!.id,
        items: {
          create: calculated.map((item) => ({
            saleItemId: item.saleItem.id,
            quantity: item.quantity,
            refundAmount: item.refundAmount,
          })),
        },
      },
      include: {
        items: { include: { saleItem: { include: { product: { select: { id: true, sku: true, name: true } } } } } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    await tx.stockMovement.createMany({
      data: calculated.map((item) => ({
        productId: item.saleItem.productId,
        type: "SALE_RETURN",
        change: item.quantity,
        note: `Retur transaksi #${saleId}: ${data.reason}`,
        createdById: req.user!.id,
        saleReturnId: created.id,
        saleId,
      })),
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "SALE_RETURN_CREATE",
      entity: "SaleReturn",
      entityId: created.id,
      after: {
        saleId,
        reason: created.reason,
        totalRefund,
        items: calculated.map((item) => ({
          saleItemId: item.saleItem.id,
          quantity: item.quantity,
          refundAmount: item.refundAmount,
        })),
      },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(result);
});

function allocateDiscount(subtotal: number, discount: number, items: { id: number; quantity: number; unitPrice: number }[]) {
  const shares = new Map<number, number>();
  if (discount === 0 || subtotal === 0) {
    for (const item of items) shares.set(item.id, 0);
    return shares;
  }

  // Diskon dibagi menurut nilai tiap baris; sisa rupiah diberikan ke pecahan terbesar.
  const allocations = items.map((item) => {
    const gross = item.quantity * item.unitPrice;
    const numerator = BigInt(discount) * BigInt(gross);
    const denominator = BigInt(subtotal);
    const floorShare = Number(numerator / denominator);
    shares.set(item.id, floorShare);
    return { id: item.id, remainder: numerator % denominator };
  });
  let remaining = discount - [...shares.values()].reduce((total, value) => total + value, 0);
  allocations.sort((a, b) => a.remainder === b.remainder ? a.id - b.id : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    const allocation = allocations[index % allocations.length];
    shares.set(allocation.id, (shares.get(allocation.id) ?? 0) + 1);
  }
  return shares;
}

export default router;
