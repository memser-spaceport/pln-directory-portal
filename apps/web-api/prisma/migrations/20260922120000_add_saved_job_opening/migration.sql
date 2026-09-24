-- A member's private bookmark on a job opening, behind the board's Saved tab.
--
-- Its own table rather than a flag on JobOpeningInterest: interest is a one-way
-- signal to the hiring team that is pushed to their ATS, a save is private and
-- reversible, and one row could not mean both.
--
-- Additive, no backfill: nothing was saved before this table existed.

-- CreateTable
CREATE TABLE "SavedJobOpening" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "jobOpeningUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedJobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedJobOpening_uid_key" ON "SavedJobOpening"("uid");

-- CreateIndex
CREATE INDEX "SavedJobOpening_jobOpeningUid_idx" ON "SavedJobOpening"("jobOpeningUid");

-- CreateIndex
CREATE INDEX "SavedJobOpening_memberUid_idx" ON "SavedJobOpening"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJobOpening_jobOpeningUid_memberUid_key" ON "SavedJobOpening"("jobOpeningUid", "memberUid");

-- AddForeignKey
ALTER TABLE "SavedJobOpening" ADD CONSTRAINT "SavedJobOpening_jobOpeningUid_fkey" FOREIGN KEY ("jobOpeningUid") REFERENCES "JobOpening"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJobOpening" ADD CONSTRAINT "SavedJobOpening_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
