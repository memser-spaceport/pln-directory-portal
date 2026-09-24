-- Triage for the team applicants page. Two facts of different shapes: the team's
-- "reviewed" tick lives on the application/interest row, while "this lead has
-- opened it" is per viewer and gets its own table, because a shared column would
-- blank a co-lead's new badge for a row they never opened.
--
-- No backfill: an absent tick and an absent view row already mean "not reviewed"
-- and "not seen" for every existing row, and nothing has been flagged for an ATS.

-- CreateEnum
CREATE TYPE "JobCandidateKind" AS ENUM ('APPLICATION', 'JOB_INTEREST');

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUid" TEXT,
ADD COLUMN     "sendToAts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendToAtsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JobOpeningInterest" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUid" TEXT,
ADD COLUMN     "sendToAts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sendToAtsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "JobCandidateView" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "kind" "JobCandidateKind" NOT NULL,
    "rowUid" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCandidateView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobCandidateView_uid_key" ON "JobCandidateView"("uid");

-- CreateIndex
CREATE INDEX "JobCandidateView_rowUid_idx" ON "JobCandidateView"("rowUid");

-- CreateIndex
CREATE INDEX "JobCandidateView_memberUid_idx" ON "JobCandidateView"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "JobCandidateView_memberUid_kind_rowUid_key" ON "JobCandidateView"("memberUid", "kind", "rowUid");

-- AddForeignKey
ALTER TABLE "JobCandidateView" ADD CONSTRAINT "JobCandidateView_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
