-- CreateEnum
CREATE TYPE "DealSubmissionStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DealIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "DealSubmission" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorTeamUid" TEXT,
    "logoUid" TEXT,
    "category" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "redemptionInstructions" TEXT NOT NULL,
    "authorMemberUid" TEXT NOT NULL,
    "authorTeamUid" TEXT,
    "status" "DealSubmissionStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedByMemberUid" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealIssue" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "dealUid" TEXT NOT NULL,
    "authorMemberUid" TEXT NOT NULL,
    "authorTeamUid" TEXT,
    "description" TEXT NOT NULL,
    "status" "DealIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByMemberUid" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealSubmission_uid_key" ON "DealSubmission"("uid");
CREATE INDEX "DealSubmission_vendorTeamUid_idx" ON "DealSubmission"("vendorTeamUid");
CREATE INDEX "DealSubmission_authorMemberUid_idx" ON "DealSubmission"("authorMemberUid");
CREATE INDEX "DealSubmission_authorTeamUid_idx" ON "DealSubmission"("authorTeamUid");
CREATE INDEX "DealSubmission_status_idx" ON "DealSubmission"("status");
CREATE INDEX "DealSubmission_createdAt_idx" ON "DealSubmission"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealIssue_uid_key" ON "DealIssue"("uid");
CREATE INDEX "DealIssue_dealUid_idx" ON "DealIssue"("dealUid");
CREATE INDEX "DealIssue_authorMemberUid_idx" ON "DealIssue"("authorMemberUid");
CREATE INDEX "DealIssue_authorTeamUid_idx" ON "DealIssue"("authorTeamUid");
CREATE INDEX "DealIssue_status_idx" ON "DealIssue"("status");
CREATE INDEX "DealIssue_createdAt_idx" ON "DealIssue"("createdAt");

-- AddForeignKey
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_vendorTeamUid_fkey" FOREIGN KEY ("vendorTeamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_logoUid_fkey" FOREIGN KEY ("logoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_authorMemberUid_fkey" FOREIGN KEY ("authorMemberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_authorTeamUid_fkey" FOREIGN KEY ("authorTeamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_reviewedByMemberUid_fkey" FOREIGN KEY ("reviewedByMemberUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealIssue" ADD CONSTRAINT "DealIssue_dealUid_fkey" FOREIGN KEY ("dealUid") REFERENCES "Deal"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealIssue" ADD CONSTRAINT "DealIssue_authorMemberUid_fkey" FOREIGN KEY ("authorMemberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealIssue" ADD CONSTRAINT "DealIssue_authorTeamUid_fkey" FOREIGN KEY ("authorTeamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealIssue" ADD CONSTRAINT "DealIssue_resolvedByMemberUid_fkey" FOREIGN KEY ("resolvedByMemberUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
