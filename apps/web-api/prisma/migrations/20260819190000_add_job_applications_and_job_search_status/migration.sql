-- CreateEnum
CREATE TYPE "job_search_status" AS ENUM ('ACTIVELY_LOOKING', 'OPEN_TO_RIGHT_ROLE', 'NOT_LOOKING');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "jobSearchStatus" "job_search_status",
ADD COLUMN "currentCompany" TEXT;

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "jobOpeningUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "coverLetter" TEXT NOT NULL,
    "profileSnapshot" JSONB NOT NULL,
    "toEmail" TEXT NOT NULL,
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_uid_key" ON "JobApplication"("uid");

-- CreateIndex
CREATE INDEX "JobApplication_memberUid_idx" ON "JobApplication"("memberUid");

-- CreateIndex
CREATE INDEX "JobApplication_jobOpeningUid_idx" ON "JobApplication"("jobOpeningUid");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_jobOpeningUid_memberUid_key" ON "JobApplication"("jobOpeningUid", "memberUid");

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobOpeningUid_fkey" FOREIGN KEY ("jobOpeningUid") REFERENCES "JobOpening"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
