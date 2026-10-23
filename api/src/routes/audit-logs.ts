import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const filterSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  entity: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: "Tanggal mulai tidak boleh melewati tanggal akhir.",
  path: ["from"],
});

router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const filters = filterSchema.parse(req.query);
  const where = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  };
  const skip = (filters.page - 1) * filters.limit;
  const [data, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({
    data,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  });
});

export default router;
