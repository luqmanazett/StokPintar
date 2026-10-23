import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { audit } from "../services/audit";

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
    SELECT p.id, p.sku, p.name, p."categoryId", c.name AS category,
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

router.post("/", requireAuth, requireRole("ADMIN", "GUDANG"), async (req, res) => {
  const data = productSchema.parse(req.body);
  const exists = await prisma.product.findUnique({ where: { sku: data.sku } });
  if (exists) throw new AppError(409, "SKU sudah dipakai");
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data });
    await audit(tx, {
      userId: req.user!.id,
      action: "PRODUCT_CREATE",
      entity: "Product",
      entityId: created.id,
      after: {
        sku: created.sku,
        name: created.name,
        categoryId: created.categoryId,
        costPrice: created.costPrice,
        sellPrice: created.sellPrice,
      },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(product);
});

router.put("/:id", requireAuth, requireRole("ADMIN", "GUDANG"), async (req, res) => {
  const id = Number(req.params.id);
  const data = productSchema.partial().parse(req.body);
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw new AppError(404, "Produk tidak ditemukan");

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id }, data });
    await audit(tx, {
      userId: req.user!.id,
      action: "PRODUCT_UPDATE",
      entity: "Product",
      entityId: id,
      before: { sku: before.sku, name: before.name, costPrice: before.costPrice, sellPrice: before.sellPrice },
      after: { sku: updated.sku, name: updated.name, costPrice: updated.costPrice, sellPrice: updated.sellPrice },
      ip: req.ip,
    });
    return updated;
  });
  res.json(product);
});

// "hapus" = arsipkan, supaya riwayat transaksi tetap utuh
router.delete("/:id", requireAuth, requireRole("ADMIN", "GUDANG"), async (req, res) => {
  const id = Number(req.params.id);
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw new AppError(404, "Produk tidak ditemukan");
  await prisma.$transaction(async (tx) => {
    const archived = await tx.product.update({ where: { id }, data: { isActive: false } });
    await audit(tx, {
      userId: req.user!.id,
      action: "PRODUCT_ARCHIVE",
      entity: "Product",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: archived.isActive },
      ip: req.ip,
    });
  });
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
