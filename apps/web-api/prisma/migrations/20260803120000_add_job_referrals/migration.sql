-- CreateTable
CREATE TABLE "JobReferral" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "jobOpeningUid" TEXT NOT NULL,
    "referrerMemberUid" TEXT NOT NULL,
    "referredMemberUid" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobReferral_uid_key" ON "JobReferral"("uid");

-- CreateIndex
CREATE INDEX "JobReferral_jobOpeningUid_idx" ON "JobReferral"("jobOpeningUid");

-- CreateIndex
CREATE INDEX "JobReferral_referrerMemberUid_idx" ON "JobReferral"("referrerMemberUid");

-- CreateIndex
CREATE INDEX "JobReferral_referredMemberUid_idx" ON "JobReferral"("referredMemberUid");

-- AddForeignKey
ALTER TABLE "JobReferral" ADD CONSTRAINT "JobReferral_jobOpeningUid_fkey" FOREIGN KEY ("jobOpeningUid") REFERENCES "JobOpening"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferral" ADD CONSTRAINT "JobReferral_referrerMemberUid_fkey" FOREIGN KEY ("referrerMemberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferral" ADD CONSTRAINT "JobReferral_referredMemberUid_fkey" FOREIGN KEY ("referredMemberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
