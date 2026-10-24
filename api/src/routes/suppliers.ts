import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { audit } from "../services/audit";

const router = Router();
const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
});
const supplierUpdateSchema = supplierSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "Minimal satu data pemasok harus diubah.",
});

router.get("/", requireAuth, requireRole("ADMIN", "MANAJER", "GUDANG"), async (_req, res) => {
  res.json(await prisma.supplier.findMany({ orderBy: { name: "asc" } }));
});

router.get("/:id", requireAuth, requireRole("ADMIN", "MANAJER", "GUDANG"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new AppError(404, "Pemasok tidak ditemukan");
  res.json(supplier);
});

router.post("/", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const data = supplierSchema.parse(req.body);
  const supplier = await prisma.$transaction(async (tx) => {
    const created = await tx.supplier.create({ data });
    await audit(tx, {
      userId: req.user!.id,
      action: "SUPPLIER_CREATE",
      entity: "Supplier",
      entityId: created.id,
      after: { name: created.name, phone: created.phone, address: created.address, isActive: created.isActive },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(supplier);
});

router.put("/:id", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const data = supplierUpdateSchema.parse(req.body);
  const before = await prisma.supplier.findUnique({ where: { id } });
  if (!before) throw new AppError(404, "Pemasok tidak ditemukan");

  const supplier = await prisma.$transaction(async (tx) => {
    const updated = await tx.supplier.update({ where: { id }, data });
    await audit(tx, {
      userId: req.user!.id,
      action: "SUPPLIER_UPDATE",
      entity: "Supplier",
      entityId: id,
      before: { name: before.name, phone: before.phone, address: before.address, isActive: before.isActive },
      after: { name: updated.name, phone: updated.phone, address: updated.address, isActive: updated.isActive },
      ip: req.ip,
    });
    return updated;
  });
  res.json(supplier);
});

router.delete("/:id", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const before = await prisma.supplier.findUnique({ where: { id } });
  if (!before) throw new AppError(404, "Pemasok tidak ditemukan");

  await prisma.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id }, data: { isActive: false } });
    await audit(tx, {
      userId: req.user!.id,
      action: "SUPPLIER_ARCHIVE",
      entity: "Supplier",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: false },
      ip: req.ip,
    });
  });
  res.json({ message: "Pemasok diarsipkan" });
});

export default router;
