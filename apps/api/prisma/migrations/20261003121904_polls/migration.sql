-- CreateEnum
CREATE TYPE "PollAudience" AS ENUM ('ALL', 'BLOCKS');

-- CreateTable
CREATE TABLE "polls" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "endsOn" DATE NOT NULL,
    "audience" "PollAudience" NOT NULL,
    "blockIds" UUID[],
    "closedAt" TIMESTAMP(3),
    "sharedAt" TIMESTAMP(3),
    "announcementId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "polls_siteId_createdAt_idx" ON "polls"("siteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "polls_id_siteId_key" ON "polls"("id", "siteId");

-- CreateIndex
CREATE INDEX "poll_options_pollId_idx" ON "poll_options"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_options_id_pollId_key" ON "poll_options"("id", "pollId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_pollId_unitId_key" ON "poll_votes"("pollId", "unitId");

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_pollId_siteId_fkey" FOREIGN KEY ("pollId", "siteId") REFERENCES "polls"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pollId_siteId_fkey" FOREIGN KEY ("pollId", "siteId") REFERENCES "polls"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_optionId_pollId_fkey" FOREIGN KEY ("optionId", "pollId") REFERENCES "poll_options"("id", "pollId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_unitId_siteId_fkey" FOREIGN KEY ("unitId", "siteId") REFERENCES "units"("id", "siteId") ON DELETE CASCADE ON UPDATE CASCADE;
