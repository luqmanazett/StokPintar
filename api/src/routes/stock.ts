import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getStock } from "../services/stock";

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

router.post("/in", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { productId, quantity, note } = inSchema.parse(req.body);
  const product = await prisma.product.findFirst({ where: { id: productId, isActive: true } });
  if (!product) throw new AppError(404, "Produk tidak ditemukan");

  const movement = await prisma.stockMovement.create({
    data: {
      productId,
      type: "IN",
      change: quantity,
      note,
      createdById: req.user!.id,
    },
  });
  res.status(201).json(movement);
});

router.post("/adjust", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { productId, change, note } = adjustSchema.parse(req.body);

  const movement = await prisma.$transaction(async (tx) => {
    const current = await getStock(tx, productId);
    if (current + change < 0) throw new AppError(400, "Stok tidak boleh negatif");

    return tx.stockMovement.create({
      data: {
        productId,
        type: "ADJUSTMENT",
        change,
        note,
        createdById: req.user!.id,
      },
    });
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
