-- CreateEnum
CREATE TYPE "LabosDigestFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "LabosDigestPickSource" AS ENUM ('ADMIN', 'AI');

-- CreateTable
CREATE TABLE "LabosDigestOverride" (
    "id" TEXT NOT NULL,
    "newsItemUids" TEXT[],
    "setByMemberUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabosDigestOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabosDigestFrequencyState" (
    "frequency" "LabosDigestFrequency" NOT NULL,
    "lastLeadNewsItemUid" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabosDigestFrequencyState_pkey" PRIMARY KEY ("frequency")
);

-- CreateTable
CREATE TABLE "LabosDigestSend" (
    "id" TEXT NOT NULL,
    "frequency" "LabosDigestFrequency" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "source" "LabosDigestPickSource" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'forum-digest',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabosDigestSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabosDigestSendStory" (
    "id" TEXT NOT NULL,
    "sendId" TEXT NOT NULL,
    "newsItemUid" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isLead" BOOLEAN NOT NULL,

    CONSTRAINT "LabosDigestSendStory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabosDigestSend_frequency_sentAt_idx" ON "LabosDigestSend"("frequency", "sentAt");

-- CreateIndex
CREATE INDEX "LabosDigestSendStory_newsItemUid_idx" ON "LabosDigestSendStory"("newsItemUid");

-- CreateIndex
CREATE UNIQUE INDEX "LabosDigestSendStory_sendId_position_key" ON "LabosDigestSendStory"("sendId", "position");

-- AddForeignKey
ALTER TABLE "LabosDigestSendStory" ADD CONSTRAINT "LabosDigestSendStory_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "LabosDigestSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabosDigestSendStory" ADD CONSTRAINT "LabosDigestSendStory_newsItemUid_fkey" FOREIGN KEY ("newsItemUid") REFERENCES "TeamNewsItem"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
