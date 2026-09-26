-- AlterTable
ALTER TABLE "charges" ADD COLUMN     "transactionId" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "blockId" UUID;

-- AlterTable
ALTER TABLE "works" ADD COLUMN     "blockId" UUID;

-- CreateIndex
CREATE INDEX "charges_transactionId_idx" ON "charges"("transactionId");

-- CreateIndex
CREATE INDEX "transactions_blockId_idx" ON "transactions"("blockId");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_transactionId_siteId_fkey" FOREIGN KEY ("transactionId", "siteId") REFERENCES "transactions"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_blockId_siteId_fkey" FOREIGN KEY ("blockId", "siteId") REFERENCES "blocks"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_blockId_siteId_fkey" FOREIGN KEY ("blockId", "siteId") REFERENCES "blocks"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheck
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_block_expense_only" CHECK ("blockId" IS NULL OR "type" = 'EXPENSE');
