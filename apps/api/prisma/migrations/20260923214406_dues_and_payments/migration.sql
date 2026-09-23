-- CreateEnum
CREATE TYPE "DistributionMethod" AS ENUM ('EQUAL', 'AREA', 'LAND_SHARE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'ONLINE');

-- CreateTable
CREATE TABLE "charge_types" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dues_plans" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "method" "DistributionMethod" NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "validFrom" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dues_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "chargeTypeId" UUID NOT NULL,
    "duesPlanId" UUID,
    "period" TEXT,
    "description" TEXT,
    "amountKurus" INTEGER NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "accrualKey" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledById" UUID,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" DATE NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledById" UUID,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charge_types_siteId_name_key" ON "charge_types"("siteId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "charge_types_siteId_code_key" ON "charge_types"("siteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "charge_types_id_siteId_key" ON "charge_types"("id", "siteId");

-- CreateIndex
CREATE INDEX "dues_plans_siteId_validFrom_idx" ON "dues_plans"("siteId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "charges_accrualKey_key" ON "charges"("accrualKey");

-- CreateIndex
CREATE INDEX "charges_siteId_period_idx" ON "charges"("siteId", "period");

-- CreateIndex
CREATE INDEX "charges_unitId_dueDate_idx" ON "charges"("unitId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "charges_id_siteId_key" ON "charges"("id", "siteId");

-- CreateIndex
CREATE INDEX "payments_siteId_paidAt_idx" ON "payments"("siteId", "paidAt");

-- CreateIndex
CREATE INDEX "payments_unitId_idx" ON "payments"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_siteId_key" ON "payments"("id", "siteId");

-- CreateIndex
CREATE INDEX "payment_allocations_chargeId_idx" ON "payment_allocations"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_paymentId_chargeId_key" ON "payment_allocations"("paymentId", "chargeId");

-- AddForeignKey
ALTER TABLE "charge_types" ADD CONSTRAINT "charge_types_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dues_plans" ADD CONSTRAINT "dues_plans_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_chargeTypeId_siteId_fkey" FOREIGN KEY ("chargeTypeId", "siteId") REFERENCES "charge_types"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_duesPlanId_fkey" FOREIGN KEY ("duesPlanId") REFERENCES "dues_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_siteId_fkey" FOREIGN KEY ("paymentId", "siteId") REFERENCES "payments"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_chargeId_siteId_fkey" FOREIGN KEY ("chargeId", "siteId") REFERENCES "charges"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Uygulama katmanından bağımsız son güvence: tutarlar pozitif olmalı.
ALTER TABLE "dues_plans" ADD CONSTRAINT "dues_plans_amount_positive" CHECK ("amountKurus" > 0);
ALTER TABLE "charges" ADD CONSTRAINT "charges_amount_positive" CHECK ("amountKurus" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amountKurus" > 0);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_positive" CHECK ("amountKurus" > 0);
ALTER TABLE "charges" ADD CONSTRAINT "charges_due_after_issue" CHECK ("dueDate" >= "issueDate");
