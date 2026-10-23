import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getStock } from "../services/stock";
import { audit } from "../services/audit";

const router = Router();

const inSchema = z.object({
  productId: z.number().int(),
  quantity: z.number().int().positive(),
  note: z.string().optional(),
});

const adjustSchema = z.object({
  productId: z.number().int(),
  change: z
    .number()
    .int()
    .refine((n) => n !== 0, "Perubahan tidak boleh 0"),
  note: z.string().min(3, "Alasan wajib diisi"),
});

router.post("/in", requireAuth, requireRole("ADMIN", "GUDANG"), async (req, res) => {
  const { productId, quantity, note } = inSchema.parse(req.body);
  const movement = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    const product = await tx.product.findFirst({ where: { id: productId, isActive: true } });
    if (!product) throw new AppError(404, "Produk tidak ditemukan");

    const created = await tx.stockMovement.create({
      data: { productId, type: "IN", change: quantity, note, createdById: req.user!.id },
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "STOCK_IN",
      entity: "StockMovement",
      entityId: created.id,
      after: { productId, quantity, note: note ?? null, type: created.type },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(movement);
});

router.post("/adjust", requireAuth, requireRole("ADMIN", "GUDANG"), async (req, res) => {
  const { productId, change, note } = adjustSchema.parse(req.body);

  const movement = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    const product = await tx.product.findFirst({ where: { id: productId, isActive: true } });
    if (!product) throw new AppError(404, "Produk tidak ditemukan");
    const current = await getStock(tx, productId);
    if (current + change < 0) throw new AppError(400, "Stok tidak boleh negatif");

    const created = await tx.stockMovement.create({
      data: {
        productId,
        type: "ADJUSTMENT",
        change,
        note,
        createdById: req.user!.id,
      },
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "STOCK_ADJUSTMENT",
      entity: "StockMovement",
      entityId: created.id,
      before: { stock: current },
      after: { productId, stock: current + change, change, note, type: created.type },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(movement);
});

router.get("/low", requireAuth, async (req, res) => {
  const rows = await prisma.$queryRaw`
    SELECT p.id, p.sku, p.name, p."minStock",
    COALESCE(SUM(m.change), 0)::int AS stock
    FROM "Product" p
    LEFT JOIN "StockMovement" m ON m."productId" = p.id
    WHERE p."isActive" = true
    GROUP BY p.id
    HAVING COALESCE(SUM(m.change), 0) <= p."minStock"
    ORDER BY stock`;
  res.json(rows);
});

export default router;
