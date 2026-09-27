-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "startPeriod" TEXT NOT NULL,
    "method" "DistributionMethod" NOT NULL,
    "duesPlanId" UUID,
    "appliedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_siteId_startPeriod_key" ON "budgets"("siteId", "startPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_id_siteId_key" ON "budgets"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budgetId_categoryId_key" ON "budget_lines"("budgetId", "categoryId");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_duesPlanId_fkey" FOREIGN KEY ("duesPlanId") REFERENCES "dues_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetId_siteId_fkey" FOREIGN KEY ("budgetId", "siteId") REFERENCES "budgets"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_categoryId_siteId_fkey" FOREIGN KEY ("categoryId", "siteId") REFERENCES "finance_categories"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_amount_positive" CHECK ("amountKurus" > 0);
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_start_period_format" CHECK ("startPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
