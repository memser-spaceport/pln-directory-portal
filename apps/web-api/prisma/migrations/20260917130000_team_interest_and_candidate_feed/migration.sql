-- Team-level interest ("I'd like to work here", no job attached) and the
-- updatedAt columns the ATS candidates feed pages on.

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "JobApplication" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "JobApplication" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "JobOpeningInterest" ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "JobOpeningInterest" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "JobOpeningInterest" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "TeamInterest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamInterest_uid_key" ON "TeamInterest"("uid");

-- CreateIndex
CREATE INDEX "TeamInterest_teamUid_idx" ON "TeamInterest"("teamUid");

-- CreateIndex
CREATE INDEX "TeamInterest_memberUid_idx" ON "TeamInterest"("memberUid");

-- CreateIndex
CREATE INDEX "TeamInterest_updatedAt_idx" ON "TeamInterest"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInterest_teamUid_memberUid_key" ON "TeamInterest"("teamUid", "memberUid");

-- CreateIndex
CREATE INDEX "JobApplication_updatedAt_idx" ON "JobApplication"("updatedAt");

-- CreateIndex
CREATE INDEX "JobOpeningInterest_updatedAt_idx" ON "JobOpeningInterest"("updatedAt");

-- AddForeignKey
ALTER TABLE "TeamInterest" ADD CONSTRAINT "TeamInterest_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInterest" ADD CONSTRAINT "TeamInterest_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
