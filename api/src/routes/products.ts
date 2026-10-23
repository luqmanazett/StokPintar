import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const productSchema = z.object({
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  categoryId: z.number().int(),
  costPrice: z.number().int().min(0),
  sellPrice: z.number().int().min(0),
  minStock: z.number().int().min(0).default(5),
});

router.get("/", requireAuth, async (req, res) => {
  const search = `%${String(req.query.search ?? "")}%`;
  const rows = await prisma.$queryRaw`
    SELECT p.id, p.sku, p.name, c.name AS category,
    p."costPrice", p."sellPrice", p."minStock",
    COALESCE(SUM(m.change), 0)::int AS stock
    FROM "Product" p
    JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN "StockMovement" m ON m."productId" = p.id
    WHERE p."isActive" = true
    AND (p.name ILIKE ${search} OR p.sku ILIKE ${search})
    GROUP BY p.id, c.name
    ORDER BY p.name`;
  res.json(rows);
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const data = productSchema.parse(req.body);
  const exists = await prisma.product.findUnique({ where: { sku: data.sku } });
  if (exists) throw new AppError(409, "SKU sudah dipakai");
  res.status(201).json(await prisma.product.create({ data }));
});

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const data = productSchema.partial().parse(req.body);
  res.json(await prisma.product.update({ where: { id: Number(req.params.id) }, data }));
});

// "hapus" = arsipkan, supaya riwayat transaksi tetap utuh
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await prisma.product.update({ where: { id: Number(req.params.id) }, data: { isActive: false } });
  res.json({ message: "Produk diarsipkan" });
});

router.get("/:id/movements", requireAuth, async (req, res) => {
  res.json(
    await prisma.stockMovement.findMany({
      where: { productId: Number(req.params.id) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { createdBy: { select: { name: true } } },
    }),
  );
});

export default router;
