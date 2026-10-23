import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { audit } from "../services/audit";

const router = Router();

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: "Tanggal mulai tidak boleh melewati tanggal akhir.",
  path: ["from"],
});

const expenseSchema = z.object({
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  amount: z.number().int().positive(),
  incurredAt: z.coerce.date(),
});

router.get("/", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const filters = rangeSchema.parse(req.query);
  const incurredAt = filters.from || filters.to
    ? {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      }
    : undefined;
  const expenses = await prisma.expense.findMany({
    where: incurredAt ? { incurredAt } : undefined,
    orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json(expenses);
});

router.post("/", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const data = expenseSchema.parse(req.body);
  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        category: data.category,
        description: data.description || null,
        amount: data.amount,
        incurredAt: data.incurredAt,
        createdById: req.user!.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "EXPENSE_CREATE",
      entity: "Expense",
      entityId: created.id,
      after: {
        category: created.category,
        description: created.description,
        amount: created.amount,
        incurredAt: created.incurredAt.toISOString(),
      },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(expense);
});

export default router;
