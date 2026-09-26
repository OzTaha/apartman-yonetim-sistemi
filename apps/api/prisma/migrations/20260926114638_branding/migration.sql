-- CreateTable
CREATE TABLE "branding" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "appName" TEXT NOT NULL,
    "logoKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branding_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "branding" ADD CONSTRAINT "branding_single_row" CHECK ("id" = 1);
