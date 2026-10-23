import { Router } from "express";
import { StockOpnameStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";
import { audit } from "../services/audit";
import { getStock } from "../services/stock";

const router = Router();
const createSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  notes: z.string().trim().max(1000).optional(),
});
const countSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    countedQty: z.number().int().min(0),
  })).min(1).max(1000).refine(
    (items) => new Set(items.map((item) => item.productId)).size === items.length,
    "Produk dalam hitungan tidak boleh berulang.",
  ),
});
const includeOpname = {
  category: true,
  createdBy: { select: { id: true, name: true } },
  items: {
    orderBy: { product: { name: "asc" as const } },
    include: { product: { select: { id: true, sku: true, name: true, costPrice: true } } },
  },
};

router.get("/", requireAuth, requireRole("ADMIN", "MANAJER", "GUDANG"), async (req, res) => {
  const filters = z.object({ status: z.enum(["DRAFT", "FINALIZED"]).optional() }).parse(req.query);
  res.json(await prisma.stockOpname.findMany({
    where: filters.status ? { status: filters.status } : undefined,
    orderBy: { createdAt: "desc" },
    include: includeOpname,
  }));
});

router.post("/", requireAuth, requireRole("ADMIN", "MANAJER", "GUDANG"), async (req, res) => {
  const data = createSchema.parse(req.body);
  const opname = await prisma.$transaction(async (tx) => {
    if (data.categoryId && !(await tx.category.findUnique({ where: { id: data.categoryId } }))) {
      throw new AppError(404, "Kategori tidak ditemukan");
    }
    const selectedProducts = await tx.product.findMany({
      where: { isActive: true, ...(data.categoryId ? { categoryId: data.categoryId } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (selectedProducts.length === 0) throw new AppError(400, "Tidak ada produk aktif untuk opname ini");
    for (const product of selectedProducts) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${product.id} FOR UPDATE`;
    }
    const products = await tx.product.findMany({
      where: { id: { in: selectedProducts.map((product) => product.id) }, isActive: true },
      select: { id: true, costPrice: true },
      orderBy: { id: "asc" },
    });
    const monthStamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()).replace("-", "");
    const year = Number(monthStamp.slice(0, 4));
    const month = Number(monthStamp.slice(4, 6));
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BigInt(10_000_000 + year * 100 + month)})`;
    const prefix = `SO-${monthStamp}-`;
    const latest = await tx.stockOpname.findFirst({
      where: { opnameNumber: { startsWith: prefix } },
      orderBy: { opnameNumber: "desc" },
      select: { opnameNumber: true },
    });
    const sequence = latest ? Number(latest.opnameNumber.slice(-4)) + 1 : 1;
    if (sequence > 9999) throw new AppError(409, "Nomor opname bulan ini sudah mencapai batas.");
    const opnameNumber = `${prefix}${String(sequence).padStart(4, "0")}`;
    const stocks = await tx.stockMovement.groupBy({
      by: ["productId"],
      where: { productId: { in: products.map((product) => product.id) } },
      _sum: { change: true },
    });
    const stockByProduct = new Map(stocks.map((entry) => [entry.productId, entry._sum.change ?? 0]));
    const created = await tx.stockOpname.create({
      data: {
        opnameNumber,
        categoryId: data.categoryId,
        notes: data.notes,
        createdById: req.user!.id,
        items: {
          create: products.map((product) => ({
            productId: product.id,
            systemQty: stockByProduct.get(product.id) ?? 0,
            unitCostAtOpen: product.costPrice,
          })),
        },
      },
      include: includeOpname,
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "STOCK_OPNAME_CREATE",
      entity: "StockOpname",
      entityId: created.id,
      after: {
        opnameNumber,
        categoryId: created.categoryId,
        itemCount: created.items.length,
        snapshot: created.items.map((item) => ({ productId: item.productId, systemQty: item.systemQty })),
      },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(opname);
});

router.get("/:id", requireAuth, requireRole("ADMIN", "MANAJER", "GUDANG"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const opname = await prisma.stockOpname.findUnique({ where: { id }, include: includeOpname });
  if (!opname) throw new AppError(404, "Opname tidak ditemukan");
  res.json(opname);
});

router.put("/:id/items", requireAuth, requireRole("ADMIN", "MANAJER", "GUDANG"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const data = countSchema.parse(req.body);
  const opname = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StockOpname" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.stockOpname.findUnique({ where: { id }, include: { items: true } });
    if (!before) throw new AppError(404, "Opname tidak ditemukan");
    if (before.status !== "DRAFT") throw new AppError(409, "Opname yang sudah final tidak dapat diubah");
    const itemByProduct = new Map(before.items.map((item) => [item.productId, item]));
    for (const counted of data.items) {
      const item = itemByProduct.get(counted.productId);
      if (!item) throw new AppError(400, "Produk tidak termasuk dalam snapshot opname");
      await tx.stockOpnameItem.update({ where: { id: item.id }, data: { countedQty: counted.countedQty } });
    }
    const updated = await tx.stockOpname.findUniqueOrThrow({ where: { id }, include: includeOpname });
    await audit(tx, {
      userId: req.user!.id,
      action: "STOCK_OPNAME_COUNT",
      entity: "StockOpname",
      entityId: id,
      before: { counted: before.items.filter((item) => item.countedQty !== null).map((item) => ({ productId: item.productId, countedQty: item.countedQty })) },
      after: { counted: data.items },
      ip: req.ip,
    });
    return updated;
  });
  res.json(opname);
});

router.post("/:id/finalize", requireAuth, requireRole("ADMIN", "MANAJER"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StockOpname" WHERE id = ${id} FOR UPDATE`;
    const opname = await tx.stockOpname.findUnique({ where: { id }, include: { items: true } });
    if (!opname) throw new AppError(404, "Opname tidak ditemukan");
    if (opname.status !== "DRAFT") throw new AppError(409, "Opname sudah difinalisasi");
    if (opname.items.some((item) => item.countedQty === null)) {
      throw new AppError(400, "Semua produk harus diisi sebelum opname difinalisasi");
    }

    const sortedItems = [...opname.items].sort((a, b) => a.productId - b.productId);
    for (const item of sortedItems) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${item.productId} FOR UPDATE`;
    }

    const warnings: { productId: number; productName: string; snapshotQty: number; currentQty: number; countedQty: number }[] = [];
    const changes: { productId: number; change: number; note: string }[] = [];
    for (const item of sortedItems) {
      const currentQty = await getStock(tx, item.productId);
      const countedQty = item.countedQty!;
      if (currentQty !== item.systemQty) {
        warnings.push({
          productId: item.productId,
          productName: (await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { name: true } })).name,
          snapshotQty: item.systemQty,
          currentQty,
          countedQty,
        });
      }
      const difference = countedQty - currentQty;
      await tx.stockOpnameItem.update({ where: { id: item.id }, data: { difference } });
      if (difference !== 0) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { name: true } });
        changes.push({
          productId: item.productId,
          change: difference,
          note: `${opname.opnameNumber}: sistem ${currentQty}, fisik ${countedQty} (snapshot ${item.systemQty}) - ${product.name}`,
        });
      }
    }
    if (changes.length > 0) {
      await tx.stockMovement.createMany({
        data: changes.map((change) => ({
          productId: change.productId,
          type: "OPNAME",
          change: change.change,
          note: change.note,
          createdById: req.user!.id,
          stockOpnameId: id,
        })),
      });
    }
    const finalized = await tx.stockOpname.update({
      where: { id },
      data: { status: StockOpnameStatus.FINALIZED, finalizedAt: new Date() },
      include: includeOpname,
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "STOCK_OPNAME_FINALIZE",
      entity: "StockOpname",
      entityId: id,
      before: { status: opname.status },
      after: {
        status: finalized.status,
        movements: changes.map(({ productId, change }) => ({ productId, change })),
        warnings,
      },
      ip: req.ip,
    });
    return { opname: finalized, warnings };
  });
  res.json(result);
});

export default router;
