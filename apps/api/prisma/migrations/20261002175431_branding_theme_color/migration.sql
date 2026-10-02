-- CreateEnum
CREATE TYPE "ThemeColor" AS ENUM ('BLUE', 'GREEN', 'LAVENDER');

-- AlterTable
ALTER TABLE "branding" ADD COLUMN     "themeColor" "ThemeColor" NOT NULL DEFAULT 'BLUE';
