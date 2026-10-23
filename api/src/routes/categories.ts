import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { audit } from "../services/audit";

const router = Router();

const schema = z.object({ name: z.string().trim().min(1) });

router.get("/", requireAuth, async (_req, res) => {
  res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { name } = schema.parse(req.body);
  const exists = await prisma.category.findUnique({ where: { name } });
  if (exists) throw new AppError(409, "Kategori sudah ada");
  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.category.create({ data: { name } });
    await audit(tx, {
      userId: req.user!.id,
      action: "CATEGORY_CREATE",
      entity: "Category",
      entityId: created.id,
      after: { name: created.name },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(category);
});

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const { name } = schema.parse(req.body);
  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) throw new AppError(404, "Kategori tidak ditemukan");
  const category = await prisma.$transaction(async (tx) => {
    const updated = await tx.category.update({ where: { id }, data: { name } });
    await audit(tx, {
      userId: req.user!.id,
      action: "CATEGORY_UPDATE",
      entity: "Category",
      entityId: id,
      before: { name: before.name },
      after: { name: updated.name },
      ip: req.ip,
    });
    return updated;
  });
  res.json(category);
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.product.count({ where: { categoryId: id } });
  if (used > 0) throw new AppError(409, "Kategori masih dipakai produk");
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new AppError(404, "Kategori tidak ditemukan");
  await prisma.$transaction(async (tx) => {
    await tx.category.delete({ where: { id } });
    await audit(tx, {
      userId: req.user!.id,
      action: "CATEGORY_DELETE",
      entity: "Category",
      entityId: id,
      before: { name: category.name },
      ip: req.ip,
    });
  });
  res.json({ message: "Kategori dihapus" });
});

export default router;
