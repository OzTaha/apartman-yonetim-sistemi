-- CreateEnum
CREATE TYPE "RequestCategory" AS ENUM ('FAULT', 'CLEANING', 'SECURITY', 'COMPLAINT', 'SUGGESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RequestLocation" AS ENUM ('UNIT', 'COMMON');

-- CreateEnum
CREATE TYPE "RequestEventKind" AS ENUM ('CREATED', 'STATUS', 'COMMENT', 'TASK');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_REQUEST';

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "requestId" UUID;

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "unitId" UUID NOT NULL,
    "location" "RequestLocation" NOT NULL,
    "category" "RequestCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "taskId" UUID,
    "createdById" UUID NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "residentUpdatedAt" TIMESTAMP(3),
    "residentSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_request_events" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "kind" "RequestEventKind" NOT NULL,
    "status" "RequestStatus",
    "note" TEXT,
    "userId" UUID,
    "byResident" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_requests_siteId_status_idx" ON "service_requests"("siteId", "status");

-- CreateIndex
CREATE INDEX "service_requests_createdById_idx" ON "service_requests"("createdById");

-- CreateIndex
CREATE INDEX "service_requests_unitId_idx" ON "service_requests"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_siteId_number_key" ON "service_requests"("siteId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_id_siteId_key" ON "service_requests"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_taskId_siteId_key" ON "service_requests"("taskId", "siteId");

-- CreateIndex
CREATE INDEX "service_request_events_requestId_createdAt_idx" ON "service_request_events"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_requestId_idx" ON "attachments"("requestId");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_requestId_siteId_fkey" FOREIGN KEY ("requestId", "siteId") REFERENCES "service_requests"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_taskId_siteId_fkey" FOREIGN KEY ("taskId", "siteId") REFERENCES "tasks"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_events" ADD CONSTRAINT "service_request_events_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_events" ADD CONSTRAINT "service_request_events_requestId_siteId_fkey" FOREIGN KEY ("requestId", "siteId") REFERENCES "service_requests"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;
