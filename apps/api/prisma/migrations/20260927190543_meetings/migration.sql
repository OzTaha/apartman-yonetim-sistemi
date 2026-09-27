-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('ORDINARY', 'EXTRAORDINARY');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PLANNED', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingSession" AS ENUM ('FIRST', 'SECOND');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'PROXY', 'ABSENT');

-- CreateEnum
CREATE TYPE "DecisionResult" AS ENUM ('ACCEPTED', 'REJECTED', 'INFO');

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "approvedAt" DATE;

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "kind" "MeetingKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "secondStartsAt" TIMESTAMP(3),
    "location" TEXT NOT NULL,
    "notes" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PLANNED',
    "heldSession" "MeetingSession",
    "heldAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "announcementId" UUID,
    "calledAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_items" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "budgetId" UUID,
    "resolution" TEXT,
    "result" "DecisionResult",
    "votesFor" INTEGER,
    "votesAgainst" INTEGER,
    "votesAbstain" INTEGER,
    "decisionNo" INTEGER,

    CONSTRAINT "meeting_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendance" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "name" TEXT,

    CONSTRAINT "meeting_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meetings_siteId_startsAt_idx" ON "meetings"("siteId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_id_siteId_key" ON "meetings"("id", "siteId");

-- CreateIndex
CREATE INDEX "meeting_items_meetingId_position_idx" ON "meeting_items"("meetingId", "position");

-- CreateIndex
CREATE INDEX "meeting_items_budgetId_idx" ON "meeting_items"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_items_siteId_decisionNo_key" ON "meeting_items"("siteId", "decisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendance_meetingId_unitId_key" ON "meeting_attendance"("meetingId", "unitId");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_meetingId_siteId_fkey" FOREIGN KEY ("meetingId", "siteId") REFERENCES "meetings"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_budgetId_siteId_fkey" FOREIGN KEY ("budgetId", "siteId") REFERENCES "budgets"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meetingId_siteId_fkey" FOREIGN KEY ("meetingId", "siteId") REFERENCES "meetings"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_votes_non_negative" CHECK (
  coalesce("votesFor", 0) >= 0 AND coalesce("votesAgainst", 0) >= 0 AND coalesce("votesAbstain", 0) >= 0
);
ALTER TABLE "meeting_items" ADD CONSTRAINT "meeting_items_decision_no_positive" CHECK ("decisionNo" IS NULL OR "decisionNo" > 0);
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_second_after_first" CHECK ("secondStartsAt" IS NULL OR "secondStartsAt" > "startsAt");
