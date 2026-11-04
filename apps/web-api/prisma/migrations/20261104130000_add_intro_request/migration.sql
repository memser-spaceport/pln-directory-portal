-- CreateEnum
CREATE TYPE "IntroRequestType" AS ENUM ('MEMBER', 'TEAM');

-- CreateTable
CREATE TABLE "IntroRequest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "requesterUid" TEXT NOT NULL,
    "type" "IntroRequestType" NOT NULL,
    "targetUid" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "telegramMessageId" TEXT,
    "telegramClaimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntroRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntroRequest_uid_key" ON "IntroRequest"("uid");

-- CreateIndex
CREATE INDEX "IntroRequest_telegramMessageId_createdAt_idx" ON "IntroRequest"("telegramMessageId", "createdAt");

-- AddForeignKey
ALTER TABLE "IntroRequest" ADD CONSTRAINT "IntroRequest_requesterUid_fkey" FOREIGN KEY ("requesterUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
