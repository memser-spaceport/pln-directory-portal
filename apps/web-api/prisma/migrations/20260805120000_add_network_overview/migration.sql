-- CreateEnum
CREATE TYPE "NetworkOverviewStatus" AS ENUM ('READY', 'FAILED');

-- CreateTable
CREATE TABLE "NetworkOverview" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowDays" INTEGER NOT NULL DEFAULT 14,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "featuredNewsItemUid" TEXT,
    "featuredTitle" TEXT,
    "featuredSummary" TEXT,
    "featuredImageUrl" TEXT,
    "featuredSourceUrl" TEXT,
    "featuredTeamName" TEXT,
    "leadParagraph" TEXT NOT NULL DEFAULT '',
    "topStories" JSONB NOT NULL DEFAULT '[]',
    "generalUpdates" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "sourceRunId" TEXT,
    "rawPayload" JSONB,
    "status" "NetworkOverviewStatus" NOT NULL DEFAULT 'READY',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkOverview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkOverview_uid_key" ON "NetworkOverview"("uid"); 

-- CreateIndex
CREATE INDEX "NetworkOverview_generatedAt_idx" ON "NetworkOverview"("generatedAt");

-- CreateIndex
CREATE INDEX "NetworkOverview_status_idx" ON "NetworkOverview"("status");

-- CreateIndex
CREATE INDEX "NetworkOverview_status_generatedAt_idx" ON "NetworkOverview"("status", "generatedAt" DESC);

-- AddForeignKey
ALTER TABLE "NetworkOverview" ADD CONSTRAINT "NetworkOverview_featuredNewsItemUid_fkey" FOREIGN KEY ("featuredNewsItemUid") REFERENCES "TeamNewsItem"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
