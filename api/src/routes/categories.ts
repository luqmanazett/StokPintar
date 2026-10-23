import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const schema = z.object({ name: z.string().trim().min(1) });

router.get("/", requireAuth, async (_req, res) => {
  res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { name } = schema.parse(req.body);
  const exists = await prisma.category.findUnique({ where: { name } });
  if (exists) throw new AppError(409, "Kategori sudah ada");
  res.status(201).json(await prisma.category.create({ data: { name } }));
});

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { name } = schema.parse(req.body);
  res.json(await prisma.category.update({ where: { id: Number(req.params.id) }, data: { name } }));
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.product.count({ where: { categoryId: id } });
  if (used > 0) throw new AppError(409, "Kategori masih dipakai produk");
  await prisma.category.delete({ where: { id } });
  res.json({ message: "Kategori dihapus" });
});

export default router;
