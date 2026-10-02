-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID;
