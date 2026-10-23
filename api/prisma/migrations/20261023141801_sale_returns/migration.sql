-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'SALE_RETURN';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "saleReturnId" INTEGER;

-- CreateTable
CREATE TABLE "SaleReturn" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "totalRefund" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReturnItem" (
    "id" SERIAL NOT NULL,
    "saleReturnId" INTEGER NOT NULL,
    "saleItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refundAmount" INTEGER NOT NULL,

    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleReturn_saleId_createdAt_idx" ON "SaleReturn"("saleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturnItem_saleReturnId_saleItemId_key" ON "SaleReturnItem"("saleReturnId", "saleItemId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
