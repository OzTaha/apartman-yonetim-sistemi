-- AlterTable
ALTER TABLE "charges" ADD COLUMN     "workId" UUID;

-- AlterTable
ALTER TABLE "works" ADD COLUMN     "chargeMethod" "DistributionMethod";

-- CreateIndex
CREATE INDEX "charges_workId_idx" ON "charges"("workId");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_workId_siteId_fkey" FOREIGN KEY ("workId", "siteId") REFERENCES "works"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "charges" ADD CONSTRAINT "charges_single_source" CHECK (num_nonnulls("transactionId", "workId") <= 1);
