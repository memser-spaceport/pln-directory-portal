-- CreateEnum
CREATE TYPE "MemberFollowUpStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MemberFeedbackResponseType" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');

-- CreateTable
CREATE TABLE "MemberInteraction" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "hasFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "sourceMemberUid" TEXT NOT NULL,
    "targetMemberUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFollowUp" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "status" "MemberFollowUpStatus" NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "isDelayed" BOOLEAN NOT NULL DEFAULT false,
    "interactionUid" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFeedback" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "rating" INTEGER,
    "comments" TEXT[],
    "response" "MemberFeedbackResponseType" NOT NULL,
    "followUpUid" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberInteraction_uid_key" ON "MemberInteraction"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberFollowUp_uid_key" ON "MemberFollowUp"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberFeedback_uid_key" ON "MemberFeedback"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberFeedback_followUpUid_key" ON "MemberFeedback"("followUpUid");

-- AddForeignKey
ALTER TABLE "MemberInteraction" ADD CONSTRAINT "MemberInteraction_sourceMemberUid_fkey" FOREIGN KEY ("sourceMemberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInteraction" ADD CONSTRAINT "MemberInteraction_targetMemberUid_fkey" FOREIGN KEY ("targetMemberUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFollowUp" ADD CONSTRAINT "MemberFollowUp_interactionUid_fkey" FOREIGN KEY ("interactionUid") REFERENCES "MemberInteraction"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFollowUp" ADD CONSTRAINT "MemberFollowUp_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFeedback" ADD CONSTRAINT "MemberFeedback_followUpUid_fkey" FOREIGN KEY ("followUpUid") REFERENCES "MemberFollowUp"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFeedback" ADD CONSTRAINT "MemberFeedback_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
