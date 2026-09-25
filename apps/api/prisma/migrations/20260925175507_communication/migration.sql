-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'BLOCKS', 'UNITS');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('DUES_REMINDER', 'ANNOUNCEMENT', 'EMERGENCY', 'INFO');

-- CreateEnum
CREATE TYPE "RecipientFilter" AS ENUM ('ALL', 'BLOCKS', 'UNITS', 'DEBTORS', 'OVERDUE');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "announcementId" UUID;

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "blockIds" UUID[],
    "unitIds" UUID[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATE,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CampaignKind" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_campaigns" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "kind" "CampaignKind" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "filter" "RecipientFilter" NOT NULL,
    "blockIds" UUID[],
    "unitIds" UUID[],
    "body" TEXT NOT NULL,
    "announcementId" UUID,
    "autoKey" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_deliveries" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "occupancyId" UUID,
    "name" TEXT NOT NULL,
    "blockName" TEXT,
    "unitNumber" TEXT,
    "phone" TEXT,
    "text" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_siteId_publishedAt_idx" ON "announcements"("siteId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "announcements_id_siteId_key" ON "announcements"("id", "siteId");

-- CreateIndex
CREATE INDEX "announcement_reads_userId_idx" ON "announcement_reads"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_reads_announcementId_userId_key" ON "announcement_reads"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_siteId_name_key" ON "message_templates"("siteId", "name");

-- CreateIndex
CREATE INDEX "message_campaigns_siteId_createdAt_idx" ON "message_campaigns"("siteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_campaigns_id_siteId_key" ON "message_campaigns"("id", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "message_campaigns_siteId_autoKey_key" ON "message_campaigns"("siteId", "autoKey");

-- CreateIndex
CREATE INDEX "message_deliveries_campaignId_status_idx" ON "message_deliveries"("campaignId", "status");

-- CreateIndex
CREATE INDEX "attachments_announcementId_idx" ON "attachments"("announcementId");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_announcementId_siteId_fkey" FOREIGN KEY ("announcementId", "siteId") REFERENCES "announcements"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcementId_siteId_fkey" FOREIGN KEY ("announcementId", "siteId") REFERENCES "announcements"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_announcementId_siteId_fkey" FOREIGN KEY ("announcementId", "siteId") REFERENCES "announcements"("id", "siteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_campaignId_siteId_fkey" FOREIGN KEY ("campaignId", "siteId") REFERENCES "message_campaigns"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_single_target";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_single_target" CHECK (
  num_nonnulls("transactionId", "workId", "paymentId", "announcementId") = 1
);
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_targets" CHECK (
  ("audience" <> 'BLOCKS' OR cardinality("blockIds") > 0)
  AND ("audience" <> 'UNITS' OR cardinality("unitIds") > 0)
);
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_attempts" CHECK ("attempts" >= 0);
