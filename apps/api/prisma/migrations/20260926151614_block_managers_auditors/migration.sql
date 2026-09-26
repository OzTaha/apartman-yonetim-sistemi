-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SiteRole" ADD VALUE 'BLOCK_MANAGER';
ALTER TYPE "SiteRole" ADD VALUE 'AUDITOR';

-- CreateTable
CREATE TABLE "block_managers" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "blockId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_managers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "block_managers_siteId_userId_idx" ON "block_managers"("siteId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "block_managers_blockId_userId_key" ON "block_managers"("blockId", "userId");

-- AddForeignKey
ALTER TABLE "block_managers" ADD CONSTRAINT "block_managers_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_managers" ADD CONSTRAINT "block_managers_blockId_siteId_fkey" FOREIGN KEY ("blockId", "siteId") REFERENCES "blocks"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_managers" ADD CONSTRAINT "block_managers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
