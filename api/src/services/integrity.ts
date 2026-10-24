import { prisma } from "../db";

export type IntegrityCheck = {
  id: string;
  label: string;
  passed: boolean;
  checkedCount: number;
  issueCount: number;
  issues: string[];
};

export async function runIntegrityChecks(): Promise<IntegrityCheck[]> {
  const [products, sales, purchaseOrders, opnames, expenses] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        movements: { select: { change: true } },
      },
    }),
    prisma.sale.findMany({
      select: {
        id: true,
        status: true,
        subtotal: true,
        discount: true,
        total: true,
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            returns: { select: { quantity: true, refundAmount: true, saleReturnId: true } },
          },
        },
        movements: { select: { productId: true, type: true, change: true, saleReturnId: true } },
        returns: {
          select: {
            id: true,
            totalRefund: true,
            items: { select: { saleItemId: true, quantity: true, refundAmount: true } },
          },
        },
      },
    }),
    prisma.purchaseOrder.findMany({
      select: {
        id: true,
        orderNumber: true,
        status: true,
        items: {
          select: {
            id: true,
            qtyOrdered: true,
            qtyReceived: true,
            receiptItems: { select: { quantity: true } },
          },
        },
        receipts: { select: { id: true } },
      },
    }),
    prisma.stockOpname.findMany({
      select: {
        id: true,
        opnameNumber: true,
        status: true,
        items: { select: { productId: true, countedQty: true, difference: true } },
        movements: { select: { productId: true, change: true } },
      },
    }),
    prisma.expense.findMany({ select: { id: true, amount: true } }),
  ]);

  const negativeStock: string[] = [];
  for (const product of products) {
    const balance = product.movements.reduce((total, movement) => total + movement.change, 0);
    if (balance < 0) negativeStock.push(`${product.sku} (${product.name}): saldo ${balance}`);
  }

  const invalidSales: string[] = [];
  for (const sale of sales) {
    const subtotal = sale.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
    if (subtotal !== sale.subtotal || sale.total !== sale.subtotal - sale.discount) {
      invalidSales.push(`Transaksi #${sale.id}: subtotal atau total tidak cocok`);
    }
    const expectedByProduct = sumBy(sale.items, (item) => item.productId, (item) => -item.quantity);
    const actualSaleMovements = sumBy(
      sale.movements.filter((movement) => movement.type === "SALE"),
      (movement) => movement.productId,
      (movement) => movement.change,
    );
    if (!mapsEqual(expectedByProduct, actualSaleMovements)) {
      invalidSales.push(`Transaksi #${sale.id}: pergerakan stok penjualan tidak cocok`);
    }

    for (const item of sale.items) {
      const returned = item.returns.reduce((total, entry) => total + entry.quantity, 0);
      if (returned > item.quantity) invalidSales.push(`Transaksi #${sale.id}: jumlah retur melebihi jumlah terjual`);
    }
    const returnedMovements = sumBy(
      sale.movements.filter((movement) => movement.type === "SALE_RETURN"),
      (movement) => movement.productId,
      (movement) => movement.change,
    );
    const expectedReturns = new Map<number, number>();
    for (const item of sale.items) {
      const quantity = item.returns.reduce((total, entry) => total + entry.quantity, 0);
      expectedReturns.set(item.productId, (expectedReturns.get(item.productId) ?? 0) + quantity);
    }
    if (!mapsEqual(expectedReturns, returnedMovements)) {
      invalidSales.push(`Transaksi #${sale.id}: pergerakan stok retur tidak cocok`);
    }

    const saleRefunds = sale.returns.reduce((total, entry) => total + entry.totalRefund, 0);
    const refundItems = sale.returns.reduce(
      (total, entry) => total + entry.items.reduce((itemTotal, item) => itemTotal + item.refundAmount, 0),
      0,
    );
    if (saleRefunds !== refundItems) invalidSales.push(`Transaksi #${sale.id}: total refund tidak cocok dengan detail retur`);
    const returnedBySaleItem = new Map<number, number>();
    for (const item of sale.items) {
      returnedBySaleItem.set(item.id, item.returns.reduce((total, entry) => total + entry.quantity, 0));
    }
    const returnItemsBySaleItem = new Map<number, number>();
    for (const entry of sale.returns) {
      for (const item of entry.items) {
        returnItemsBySaleItem.set(
          item.saleItemId,
          (returnItemsBySaleItem.get(item.saleItemId) ?? 0) + item.quantity,
        );
      }
    }
    if (!mapsEqual(returnedBySaleItem, returnItemsBySaleItem)) {
      invalidSales.push(`Transaksi #${sale.id}: detail barang retur tidak sesuai dengan transaksi asal`);
    }
    if (sale.status === "VOIDED" && sale.returns.length > 0) {
      invalidSales.push(`Transaksi #${sale.id}: transaksi batal memiliki retur`);
    }

    const voidMovements = sumBy(
      sale.movements.filter((movement) => movement.type === "VOID"),
      (movement) => movement.productId,
      (movement) => movement.change,
    );
    const expectedVoid = sale.status === "VOIDED"
      ? new Map([...expectedByProduct].map(([productId, quantity]) => [productId, -quantity]))
      : new Map<number, number>();
    if (!mapsEqual(expectedVoid, voidMovements)) {
      invalidSales.push(`Transaksi #${sale.id}: status batal dan pergerakan stok tidak cocok`);
    }
  }

  const invalidPurchaseOrders: string[] = [];
  for (const order of purchaseOrders) {
    const allReceived = order.items.length > 0 && order.items.every((item) => item.qtyReceived === item.qtyOrdered);
    const anyReceived = order.items.some((item) => item.qtyReceived > 0);
    for (const item of order.items) {
      const receiptTotal = item.receiptItems.reduce((total, receipt) => total + receipt.quantity, 0);
      if (item.qtyReceived < 0 || item.qtyReceived > item.qtyOrdered || item.qtyReceived !== receiptTotal) {
        invalidPurchaseOrders.push(`${order.orderNumber}: jumlah penerimaan baris tidak cocok`);
      }
    }
    const statusInvalid =
      (order.status === "DRAFT" && (anyReceived || order.receipts.length > 0)) ||
      (order.status === "ORDERED" && (anyReceived || order.receipts.length > 0)) ||
      (order.status === "PARTIAL" && (!anyReceived || allReceived)) ||
      (order.status === "RECEIVED" && !allReceived) ||
      (order.status === "CANCELLED" && order.receipts.length > 0);
    if (statusInvalid) invalidPurchaseOrders.push(`${order.orderNumber}: status tidak sesuai dengan penerimaan`);
  }

  const invalidOpnames: string[] = [];
  for (const opname of opnames) {
    const expectedMovements = new Map<number, number>();
    for (const item of opname.items) {
      if (opname.status === "FINALIZED") {
        if (item.countedQty === null || item.difference === null) {
          invalidOpnames.push(`${opname.opnameNumber}: hitungan atau selisih final belum tersedia`);
          continue;
        }
        if (item.difference !== 0) expectedMovements.set(item.productId, item.difference);
      } else if (item.difference !== null) {
        invalidOpnames.push(`${opname.opnameNumber}: opname draf memiliki selisih final`);
      }
    }
    const actualMovements = sumBy(opname.movements, (movement) => movement.productId, (movement) => movement.change);
    if (!mapsEqual(expectedMovements, actualMovements)) {
      invalidOpnames.push(`${opname.opnameNumber}: penyesuaian stok tidak cocok dengan selisih opname`);
    }
  }

  const invalidExpenses = expenses
    .filter((expense) => !Number.isInteger(expense.amount) || expense.amount <= 0)
    .map((expense) => `Pengeluaran #${expense.id}: jumlah harus positif`);

  return [
    makeCheck("stock-ledger", "Saldo stok tidak negatif", products.length, negativeStock),
    makeCheck("sales-ledger", "Penjualan, retur, dan void konsisten", sales.length, invalidSales),
    makeCheck("purchase-orders", "Penerimaan sesuai pesanan pembelian", purchaseOrders.length, invalidPurchaseOrders),
    makeCheck("stock-opnames", "Penyesuaian sesuai hasil stok opname", opnames.length, invalidOpnames),
    makeCheck("expenses", "Jumlah pengeluaran valid", expenses.length, invalidExpenses),
  ];
}

function makeCheck(id: string, label: string, checkedCount: number, issues: string[]): IntegrityCheck {
  return {
    id,
    label,
    passed: issues.length === 0,
    checkedCount,
    issueCount: issues.length,
    issues: issues.slice(0, 20),
  };
}

function sumBy<T>(items: T[], key: (item: T) => number, value: (item: T) => number) {
  const totals = new Map<number, number>();
  for (const item of items) {
    const itemKey = key(item);
    totals.set(itemKey, (totals.get(itemKey) ?? 0) + value(item));
  }
  return totals;
}

function mapsEqual(left: Map<number, number>, right: Map<number, number>) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  return [...keys].every((key) => (left.get(key) ?? 0) === (right.get(key) ?? 0));
}
