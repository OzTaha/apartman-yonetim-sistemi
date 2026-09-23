-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_occupancyId_fkey";

-- DropForeignKey
ALTER TABLE "occupancies" DROP CONSTRAINT "occupancies_unitId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_blockId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "blocks_id_siteId_key" ON "blocks"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "occupancies_id_siteId_key" ON "occupancies"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "units_id_siteId_key" ON "units"("id", "siteId");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_blockId_siteId_fkey" FOREIGN KEY ("blockId", "siteId") REFERENCES "blocks"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancies" ADD CONSTRAINT "occupancies_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_occupancyId_siteId_fkey" FOREIGN KEY ("occupancyId", "siteId") REFERENCES "occupancies"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

