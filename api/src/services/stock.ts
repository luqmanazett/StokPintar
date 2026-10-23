import { Prisma } from "@prisma/client";

export async function getStock(tx: Prisma.TransactionClient, productId: number) {
  const result = await tx.stockMovement.aggregate({
    where: { productId },
    _sum: { change: true },
  });
  return result._sum.change ?? 0;
}
