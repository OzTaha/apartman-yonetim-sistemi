-- CreateEnum
CREATE TYPE "SiteKind" AS ENUM ('APARTMENT', 'SITE');

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "kind" "SiteKind" NOT NULL DEFAULT 'SITE';

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "archivedAt" TIMESTAMP(3);

