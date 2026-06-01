-- CreateEnum
CREATE TYPE "NewsEventType" AS ENUM ('FUNDING', 'LAUNCH', 'PARTNERSHIP', 'ANNOUNCEMENT', 'MILESTONE', 'OTHER');

-- CreateEnum
CREATE TYPE "NewsDiscoveryOutcome" AS ENUM ('OK', 'NO_WEBSITE', 'AGENT_FAILED');

-- CreateTable
CREATE TABLE "TeamNewsItem" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "eventType" "NewsEventType" NOT NULL DEFAULT 'OTHER',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceDomain" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamNewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamNewsItem_uid_key" ON "TeamNewsItem"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamNewsItem_canonicalKey_key" ON "TeamNewsItem"("canonicalKey");

-- CreateIndex
CREATE INDEX "TeamNewsItem_teamUid_idx" ON "TeamNewsItem"("teamUid");

-- CreateIndex
CREATE INDEX "TeamNewsItem_eventDate_idx" ON "TeamNewsItem"("eventDate");

-- CreateIndex
CREATE INDEX "TeamNewsItem_eventType_idx" ON "TeamNewsItem"("eventType");

-- CreateIndex
CREATE INDEX "TeamNewsItem_teamUid_eventDate_idx" ON "TeamNewsItem"("teamUid", "eventDate" DESC);

-- AddForeignKey
ALTER TABLE "TeamNewsItem" ADD CONSTRAINT "TeamNewsItem_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "TeamNewsEnrichment" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "lastDiscoveryAt" TIMESTAMP(3),
    "lastDiscoveryOutcome" "NewsDiscoveryOutcome",
    "recentNewsCount" INTEGER NOT NULL DEFAULT 0,
    "enrichmentSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamNewsEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamNewsEnrichment_uid_key" ON "TeamNewsEnrichment"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamNewsEnrichment_teamUid_key" ON "TeamNewsEnrichment"("teamUid");

-- CreateIndex
CREATE INDEX "TeamNewsEnrichment_teamUid_idx" ON "TeamNewsEnrichment"("teamUid");

-- CreateIndex
CREATE INDEX "TeamNewsEnrichment_lastDiscoveryOutcome_idx" ON "TeamNewsEnrichment"("lastDiscoveryOutcome");

-- AddForeignKey
ALTER TABLE "TeamNewsEnrichment" ADD CONSTRAINT "TeamNewsEnrichment_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
