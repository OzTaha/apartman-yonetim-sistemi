-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerToken" TEXT,
    "providerPayment" TEXT,
    "paymentId" UUID,
    "appliedKurus" INTEGER NOT NULL DEFAULT 0,
    "refundedKurus" INTEGER NOT NULL DEFAULT 0,
    "refundReference" TEXT,
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_providerToken_key" ON "payment_intents"("providerToken");

-- CreateIndex
CREATE INDEX "payment_intents_unitId_status_idx" ON "payment_intents"("unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_paymentId_siteId_key" ON "payment_intents"("paymentId", "siteId");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_paymentId_siteId_fkey" FOREIGN KEY ("paymentId", "siteId") REFERENCES "payments"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;
