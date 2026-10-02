-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "decisionsAnnouncementId" UUID,
ADD COLUMN     "decisionsSharedAt" TIMESTAMP(3);
