import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

router.get("/summary", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);

  const [sales] = await prisma.$queryRaw<{ transactions: number; revenue: number }[]>`
    SELECT COUNT(*)::int AS transactions, COALESCE(SUM(total), 0)::int AS revenue
    FROM "Sale"
    WHERE status = 'COMPLETED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
  `;

  const [cost] = await prisma.$queryRaw<{ cost: number }[]>`
    SELECT COALESCE(SUM(si.quantity * si."unitCost"), 0)::int AS cost
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId"
    WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
  `;

  res.json({ ...sales, profit: sales.revenue - cost.cost });
});

router.get("/daily", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);

  const rows = await prisma.$queryRaw`
    SELECT to_char((s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
    COUNT(*)::int AS transactions, SUM(s.total)::int AS revenue
    FROM "Sale" s
    WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
    GROUP BY day
    ORDER BY day
  `;
  res.json(rows);
});

router.get("/top-products", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);

  const rows = await prisma.$queryRaw`
    SELECT p.name, SUM(si.quantity)::int AS quantity, SUM(si.quantity * si."unitPrice")::int AS revenue
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId"
    JOIN "Product" p ON p.id = si."productId"
    WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
    GROUP BY p.name
    ORDER BY quantity DESC
    LIMIT 5
  `;
  res.json(rows);
});

export default router;
