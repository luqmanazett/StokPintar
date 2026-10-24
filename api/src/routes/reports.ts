import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine(({ from, to }) => from <= to, {
  message: "Tanggal mulai tidak boleh melewati tanggal akhir.",
  path: ["from"],
});

router.get("/summary", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  res.json(await calculateProfitLoss(from, to));
});

router.get("/profit-loss", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  const [summary, expensesByCategory] = await Promise.all([
    calculateProfitLoss(from, to),
    prisma.expense.groupBy({
      by: ["category"],
      where: { incurredAt: { gte: from, lte: to } },
      _sum: { amount: true },
      orderBy: { category: "asc" },
    }),
  ]);
  res.json({
    ...summary,
    expensesByCategory: expensesByCategory.map((item) => ({ category: item.category, amount: item._sum.amount ?? 0 })),
  });
});

router.get("/analytics", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  const periodLength = to.getTime() - from.getTime() + 1;
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - periodLength + 1);

  const [current, previous, paymentMethods, cashiers, expensesByCategory] = await Promise.all([
    calculateProfitLoss(from, to),
    calculateProfitLoss(previousFrom, previousTo),
    prisma.$queryRaw<{ paymentMethod: string; transactions: number; revenue: number }[]>`
      WITH sales AS (
        SELECT "paymentMethod", COUNT(*)::int AS transactions, COALESCE(SUM(total), 0)::int AS revenue
        FROM "Sale"
        WHERE status = 'COMPLETED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY "paymentMethod"
      ), refunds AS (
        SELECT s."paymentMethod", COALESCE(SUM(sr."totalRefund"), 0)::int AS refunds
        FROM "SaleReturn" sr
        JOIN "Sale" s ON s.id = sr."saleId"
        WHERE sr."createdAt" >= ${from} AND sr."createdAt" <= ${to}
        GROUP BY s."paymentMethod"
      )
      SELECT COALESCE(s."paymentMethod", r."paymentMethod") AS "paymentMethod",
      COALESCE(s.transactions, 0)::int AS transactions,
      (COALESCE(s.revenue, 0) - COALESCE(r.refunds, 0))::int AS revenue
      FROM sales s FULL OUTER JOIN refunds r ON r."paymentMethod" = s."paymentMethod"
      ORDER BY revenue DESC
    `,
    prisma.$queryRaw<{ cashierId: number; name: string; transactions: number; revenue: number }[]>`
      WITH sales AS (
        SELECT "cashierId", COUNT(*)::int AS transactions, COALESCE(SUM(total), 0)::int AS revenue
        FROM "Sale"
        WHERE status = 'COMPLETED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY "cashierId"
      ), refunds AS (
        SELECT s."cashierId", COALESCE(SUM(sr."totalRefund"), 0)::int AS refunds
        FROM "SaleReturn" sr
        JOIN "Sale" s ON s.id = sr."saleId"
        WHERE sr."createdAt" >= ${from} AND sr."createdAt" <= ${to}
        GROUP BY s."cashierId"
      )
      SELECT u.id AS "cashierId", u.name,
      COALESCE(s.transactions, 0)::int AS transactions,
      (COALESCE(s.revenue, 0) - COALESCE(r.refunds, 0))::int AS revenue
      FROM "User" u
      LEFT JOIN sales s ON s."cashierId" = u.id
      LEFT JOIN refunds r ON r."cashierId" = u.id
      WHERE s."cashierId" IS NOT NULL OR r."cashierId" IS NOT NULL
      ORDER BY revenue DESC
      LIMIT 10
    `,
    prisma.expense.groupBy({
      by: ["category"],
      where: { incurredAt: { gte: from, lte: to } },
      _sum: { amount: true },
      orderBy: { category: "asc" },
    }),
  ]);

  res.json({
    current,
    previous,
    changes: {
      transactions: percentageChange(current.transactions, previous.transactions),
      revenue: percentageChange(current.revenue, previous.revenue),
      profit: percentageChange(current.profit, previous.profit),
    },
    paymentMethods,
    cashiers,
    expensesByCategory: expensesByCategory.map((item) => ({ category: item.category, amount: item._sum.amount ?? 0 })),
    previousPeriod: { from: previousFrom, to: previousTo },
  });
});

router.get("/daily", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);

  const rows = await prisma.$queryRaw`
    WITH sales_by_day AS (
      SELECT to_char((s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS transactions, SUM(s.total)::int AS revenue
      FROM "Sale" s
      WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
      GROUP BY day
    ), returns_by_day AS (
      SELECT to_char((sr."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
      SUM(sr."totalRefund")::int AS refunds
      FROM "SaleReturn" sr
      WHERE sr."createdAt" >= ${from} AND sr."createdAt" <= ${to}
      GROUP BY day
    )
    SELECT COALESCE(s.day, r.day) AS day,
    COALESCE(s.transactions, 0)::int AS transactions,
    (COALESCE(s.revenue, 0) - COALESCE(r.refunds, 0))::int AS revenue
    FROM sales_by_day s
    FULL OUTER JOIN returns_by_day r ON r.day = s.day
    ORDER BY day
  `;
  res.json(rows);
});

router.get("/top-products", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);

  const rows = await prisma.$queryRaw`
    WITH sale_lines AS (
      SELECT s.id AS sale_id, si.id AS sale_item_id, si."productId" AS product_id, p.name,
      si.quantity, si."unitPrice" AS unit_price, s.discount, s.subtotal,
      (si.quantity::bigint * si."unitPrice"::bigint) AS gross,
      CASE WHEN s.subtotal = 0 THEN 0
        ELSE FLOOR(s.discount::numeric * si.quantity * si."unitPrice" / s.subtotal)::int
      END AS base_discount,
      CASE WHEN s.subtotal = 0 THEN 0
        ELSE MOD(s.discount::bigint * (si.quantity::bigint * si."unitPrice"::bigint), s.subtotal::bigint)
      END AS discount_remainder
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
    ), ranked_sale_lines AS (
      SELECT *,
      (discount - SUM(base_discount) OVER (PARTITION BY sale_id)) AS remaining_discount,
      ROW_NUMBER() OVER (PARTITION BY sale_id ORDER BY discount_remainder DESC, sale_item_id) AS discount_rank
      FROM sale_lines
    ), sales_by_product AS (
      SELECT product_id AS id, name, SUM(quantity)::int AS quantity,
      SUM(gross - base_discount - CASE WHEN discount_rank <= remaining_discount THEN 1 ELSE 0 END)::int AS revenue
      FROM ranked_sale_lines
      GROUP BY product_id, name
    ), returns_by_product AS (
      SELECT si."productId" AS id, SUM(sri.quantity)::int AS quantity,
      SUM(sri."refundAmount")::int AS refunds
      FROM "SaleReturnItem" sri
      JOIN "SaleReturn" sr ON sr.id = sri."saleReturnId"
      JOIN "SaleItem" si ON si.id = sri."saleItemId"
      WHERE sr."createdAt" >= ${from} AND sr."createdAt" <= ${to}
      GROUP BY si."productId"
    )
    SELECT COALESCE(s.name, p.name) AS name,
    (COALESCE(s.quantity, 0) - COALESCE(r.quantity, 0))::int AS quantity,
    (COALESCE(s.revenue, 0) - COALESCE(r.refunds, 0))::int AS revenue
    FROM sales_by_product s
    FULL OUTER JOIN returns_by_product r ON r.id = s.id
    LEFT JOIN "Product" p ON p.id = COALESCE(s.id, r.id)
    ORDER BY quantity DESC
    LIMIT 5
  `;
  res.json(rows);
});

export default router;

async function calculateProfitLoss(from: Date, to: Date) {
  const [salesRows, returnsRows, costRows, returnedCostRows, expenseRows] = await Promise.all([
    prisma.$queryRaw<{ transactions: number; revenue: number }[]>`
      SELECT COUNT(*)::int AS transactions, COALESCE(SUM(total), 0)::int AS revenue
      FROM "Sale"
      WHERE status = 'COMPLETED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
    `,
    prisma.$queryRaw<{ refunds: number }[]>`
      SELECT COALESCE(SUM("totalRefund"), 0)::int AS refunds
      FROM "SaleReturn"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
    `,
    prisma.$queryRaw<{ cost: number }[]>`
      SELECT COALESCE(SUM(si.quantity * si."unitCost"), 0)::int AS cost
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${from} AND s."createdAt" <= ${to}
    `,
    prisma.$queryRaw<{ cost: number }[]>`
      SELECT COALESCE(SUM(sri.quantity * si."unitCost"), 0)::int AS cost
      FROM "SaleReturnItem" sri
      JOIN "SaleReturn" sr ON sr.id = sri."saleReturnId"
      JOIN "SaleItem" si ON si.id = sri."saleItemId"
      WHERE sr."createdAt" >= ${from} AND sr."createdAt" <= ${to}
    `,
    prisma.expense.aggregate({
      where: { incurredAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);
  const sales = salesRows[0];
  const returns = returnsRows[0];
  const cost = costRows[0];
  const returnedCost = returnedCostRows[0];
  const revenue = sales.revenue - returns.refunds;
  const netCost = cost.cost - returnedCost.cost;
  const expenses = expenseRows._sum.amount ?? 0;
  return {
    transactions: sales.transactions,
    grossRevenue: sales.revenue,
    refunds: returns.refunds,
    revenue,
    cost: netCost,
    expenses,
    profit: revenue - netCost - expenses,
  };
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
