-- AlterEnum
ALTER TYPE "SiteRole" ADD VALUE 'STAFF';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "doorAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "employeeId" UUID,
ALTER COLUMN "occupancyId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "carrier" TEXT,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" UUID,
    "deliveredAt" TIMESTAMP(3),
    "deliveredById" UUID,
    "deliveredTo" TEXT,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT,
    "note" TEXT,
    "expectedOn" DATE,
    "arrivedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdByResident" BOOLEAN NOT NULL DEFAULT false,
    "arrivalById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packages_siteId_deliveredAt_idx" ON "packages"("siteId", "deliveredAt");

-- CreateIndex
CREATE INDEX "packages_unitId_idx" ON "packages"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "packages_id_siteId_key" ON "packages"("id", "siteId");

-- CreateIndex
CREATE INDEX "visitors_siteId_expectedOn_idx" ON "visitors"("siteId", "expectedOn");

-- CreateIndex
CREATE INDEX "visitors_unitId_idx" ON "visitors"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "visitors_id_siteId_key" ON "visitors"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_siteId_userId_key" ON "employees"("siteId", "userId");

-- CreateIndex
CREATE INDEX "invitations_employeeId_idx" ON "invitations"("employeeId");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_employeeId_siteId_fkey" FOREIGN KEY ("employeeId", "siteId") REFERENCES "employees"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Davet ya sakin ya da çalışan için olur
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_target_check" CHECK (num_nonnulls("occupancyId", "employeeId") = 1);
