-- CreateEnum
CREATE TYPE "CashAccountKind" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "receiptNo" INTEGER;

-- CreateTable
CREATE TABLE "site_counters" (
    "siteId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "site_counters_pkey" PRIMARY KEY ("siteId","name")
);

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "kind" "CashAccountKind" NOT NULL,
    "openingBalanceKurus" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "code" TEXT,
    "kind" "FinanceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "taxNumber" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vendorId" UUID,
    "startDate" DATE,
    "endDate" DATE,
    "agreedKurus" INTEGER,
    "status" "WorkStatus" NOT NULL DEFAULT 'PLANNED',
    "visibleToResidents" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "accountId" UUID NOT NULL,
    "toAccountId" UUID,
    "categoryId" UUID,
    "vendorId" UUID,
    "workId" UUID,
    "paymentId" UUID,
    "description" TEXT,
    "documentNo" TEXT,
    "visibleToResidents" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledById" UUID,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "transactionId" UUID,
    "workId" UUID,
    "paymentId" UUID,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_closings" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "closedById" UUID,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "month_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_siteId_name_key" ON "cash_accounts"("siteId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_siteId_code_key" ON "cash_accounts"("siteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_id_siteId_key" ON "cash_accounts"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_siteId_kind_name_key" ON "finance_categories"("siteId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_siteId_code_key" ON "finance_categories"("siteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_id_siteId_key" ON "finance_categories"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_siteId_name_key" ON "vendors"("siteId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_id_siteId_key" ON "vendors"("id", "siteId");

-- CreateIndex
CREATE INDEX "works_siteId_createdAt_idx" ON "works"("siteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "works_id_siteId_key" ON "works"("id", "siteId");

-- CreateIndex
CREATE INDEX "transactions_siteId_date_idx" ON "transactions"("siteId", "date");

-- CreateIndex
CREATE INDEX "transactions_accountId_idx" ON "transactions"("accountId");

-- CreateIndex
CREATE INDEX "transactions_workId_idx" ON "transactions"("workId");

-- CreateIndex
CREATE INDEX "transactions_vendorId_idx" ON "transactions"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_id_siteId_key" ON "transactions"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_paymentId_siteId_key" ON "transactions"("paymentId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_transactionId_idx" ON "attachments"("transactionId");

-- CreateIndex
CREATE INDEX "attachments_workId_idx" ON "attachments"("workId");

-- CreateIndex
CREATE INDEX "attachments_paymentId_idx" ON "attachments"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "month_closings_siteId_period_key" ON "month_closings"("siteId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "payments_siteId_receiptNo_key" ON "payments"("siteId", "receiptNo");

-- AddForeignKey
ALTER TABLE "site_counters" ADD CONSTRAINT "site_counters_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_vendorId_siteId_fkey" FOREIGN KEY ("vendorId", "siteId") REFERENCES "vendors"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_siteId_fkey" FOREIGN KEY ("accountId", "siteId") REFERENCES "cash_accounts"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_toAccountId_siteId_fkey" FOREIGN KEY ("toAccountId", "siteId") REFERENCES "cash_accounts"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_siteId_fkey" FOREIGN KEY ("categoryId", "siteId") REFERENCES "finance_categories"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_vendorId_siteId_fkey" FOREIGN KEY ("vendorId", "siteId") REFERENCES "vendors"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workId_siteId_fkey" FOREIGN KEY ("workId", "siteId") REFERENCES "works"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paymentId_siteId_fkey" FOREIGN KEY ("paymentId", "siteId") REFERENCES "payments"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_transactionId_siteId_fkey" FOREIGN KEY ("transactionId", "siteId") REFERENCES "transactions"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workId_siteId_fkey" FOREIGN KEY ("workId", "siteId") REFERENCES "works"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_paymentId_siteId_fkey" FOREIGN KEY ("paymentId", "siteId") REFERENCES "payments"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_closings" ADD CONSTRAINT "month_closings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("amountKurus" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_target" CHECK (
  ("type" = 'TRANSFER' AND "toAccountId" IS NOT NULL AND "toAccountId" <> "accountId" AND "categoryId" IS NULL)
  OR ("type" <> 'TRANSFER' AND "toAccountId" IS NULL AND "categoryId" IS NOT NULL)
);
ALTER TABLE "works" ADD CONSTRAINT "works_agreed_positive" CHECK ("agreedKurus" IS NULL OR "agreedKurus" > 0);
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_single_target" CHECK (
  num_nonnulls("transactionId", "workId", "paymentId") = 1
);

INSERT INTO "cash_accounts" ("id", "siteId", "code", "name", "kind")
SELECT gen_random_uuid(), s."id", a.code, a.name, a.kind::"CashAccountKind"
FROM "sites" s
CROSS JOIN (VALUES ('CASH', 'Nakit kasa', 'CASH'), ('BANK', 'Banka hesabı', 'BANK')) AS a(code, name, kind);

INSERT INTO "finance_categories" ("id", "siteId", "code", "kind", "name")
SELECT gen_random_uuid(), s."id", 'DUES_INCOME', 'INCOME', 'Aidat ve borç tahsilatı'
FROM "sites" s;

UPDATE "payments" p
SET "receiptNo" = numbered.n
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "siteId" ORDER BY "paidAt", "createdAt", "id") AS n
  FROM "payments"
) numbered
WHERE p."id" = numbered."id";

INSERT INTO "site_counters" ("siteId", "name", "value")
SELECT "siteId", 'receipt', max("receiptNo") FROM "payments" GROUP BY "siteId";

INSERT INTO "transactions" ("id", "siteId", "type", "amountKurus", "date", "accountId", "categoryId", "paymentId", "createdById", "createdAt")
SELECT gen_random_uuid(), p."siteId", 'INCOME', p."amountKurus", p."paidAt", a."id", c."id", p."id", p."createdById", p."createdAt"
FROM "payments" p
JOIN "cash_accounts" a ON a."siteId" = p."siteId" AND a."code" = CASE WHEN p."method" = 'CASH' THEN 'CASH' ELSE 'BANK' END
JOIN "finance_categories" c ON c."siteId" = p."siteId" AND c."code" = 'DUES_INCOME'
WHERE p."cancelledAt" IS NULL;
