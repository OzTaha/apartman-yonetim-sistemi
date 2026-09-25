-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('DOORMAN', 'SECURITY', 'CLEANING', 'GARDENER', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskEventKind" AS ENUM ('CREATED', 'EDITED', 'ASSIGNED', 'STATUS', 'NOTE');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "employeeId" UUID;

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "phone" TEXT,
    "startDate" DATE,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_tasks" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "employeeId" UUID,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "frequency" "RecurrenceFrequency" NOT NULL,
    "weekdays" INTEGER[],
    "dayOfMonth" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "employeeId" UUID,
    "dueDate" DATE,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "completedAt" TIMESTAMP(3),
    "recurringTaskId" UUID,
    "occurrenceDate" DATE,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "kind" "TaskEventKind" NOT NULL,
    "status" "TaskStatus",
    "assigneeName" TEXT,
    "note" TEXT,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_siteId_idx" ON "employees"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_id_siteId_key" ON "employees"("id", "siteId");

-- CreateIndex
CREATE INDEX "shifts_siteId_date_idx" ON "shifts"("siteId", "date");

-- CreateIndex
CREATE INDEX "shifts_employeeId_date_idx" ON "shifts"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_tasks_id_siteId_key" ON "recurring_tasks"("id", "siteId");

-- CreateIndex
CREATE INDEX "tasks_siteId_status_idx" ON "tasks"("siteId", "status");

-- CreateIndex
CREATE INDEX "tasks_employeeId_idx" ON "tasks"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_siteId_key" ON "tasks"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_recurringTaskId_occurrenceDate_key" ON "tasks"("recurringTaskId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "task_events_taskId_createdAt_idx" ON "task_events"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_employeeId_idx" ON "transactions"("employeeId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employeeId_siteId_fkey" FOREIGN KEY ("employeeId", "siteId") REFERENCES "employees"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employeeId_siteId_fkey" FOREIGN KEY ("employeeId", "siteId") REFERENCES "employees"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_employeeId_siteId_fkey" FOREIGN KEY ("employeeId", "siteId") REFERENCES "employees"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_employeeId_siteId_fkey" FOREIGN KEY ("employeeId", "siteId") REFERENCES "employees"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurringTaskId_siteId_fkey" FOREIGN KEY ("recurringTaskId", "siteId") REFERENCES "recurring_tasks"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_taskId_siteId_fkey" FOREIGN KEY ("taskId", "siteId") REFERENCES "tasks"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employee_expense" CHECK (
  "employeeId" IS NULL OR ("type" = 'EXPENSE' AND "vendorId" IS NULL)
);
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_time_format" CHECK (
  "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "startTime" <> "endTime"
);
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_rule" CHECK (
  "weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
  AND ("dayOfMonth" IS NULL OR "dayOfMonth" BETWEEN 1 AND 28)
  AND ("endDate" IS NULL OR "endDate" >= "startDate")
  AND ("frequency" <> 'WEEKLY' OR cardinality("weekdays") > 0)
  AND ("frequency" <> 'MONTHLY' OR "dayOfMonth" IS NOT NULL)
);
