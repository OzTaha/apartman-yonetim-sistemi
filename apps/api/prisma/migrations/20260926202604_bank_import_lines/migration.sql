-- CreateEnum
CREATE TYPE "BankLineStatus" AS ENUM ('IMPORTED', 'IGNORED');

-- CreateTable
CREATE TABLE "bank_import_lines" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" "BankLineStatus" NOT NULL,
    "paymentId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_import_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_import_lines_siteId_fingerprint_key" ON "bank_import_lines"("siteId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "bank_import_lines_paymentId_siteId_key" ON "bank_import_lines"("paymentId", "siteId");

-- AddForeignKey
ALTER TABLE "bank_import_lines" ADD CONSTRAINT "bank_import_lines_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_import_lines" ADD CONSTRAINT "bank_import_lines_paymentId_siteId_fkey" FOREIGN KEY ("paymentId", "siteId") REFERENCES "payments"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;
