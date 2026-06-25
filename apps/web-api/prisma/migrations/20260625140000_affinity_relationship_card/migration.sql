-- CreateEnum
CREATE TYPE "AffinityFrequencyTier" AS ENUM ('HIGH', 'STEADY', 'COOLING', 'NEGLECTED');

-- AlterTable
ALTER TABLE "AffinityPerson" ADD COLUMN     "relationshipOwnerName" VARCHAR(240),
ADD COLUMN     "relationshipOwnerEmail" VARCHAR(320),
ADD COLUMN     "relationshipOwnerAffinityPersonId" VARCHAR(64),
ADD COLUMN     "relationshipOwnerMemberUid" TEXT,
ADD COLUMN     "lastContactSummary" TEXT,
ADD COLUMN     "lastContactMethod" VARCHAR(32),
ADD COLUMN     "touchpoints6m" INTEGER,
ADD COLUMN     "touchpointsByMonth" JSONB,
ADD COLUMN     "frequencyTier" "AffinityFrequencyTier",
ADD COLUMN     "interactionWindowMonths" INTEGER DEFAULT 6,
ADD COLUMN     "relationshipStatsPulledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AffinityPerson_relationshipOwnerMemberUid_idx" ON "AffinityPerson"("relationshipOwnerMemberUid");

-- AddForeignKey
ALTER TABLE "AffinityPerson" ADD CONSTRAINT "AffinityPerson_relationshipOwnerMemberUid_fkey" FOREIGN KEY ("relationshipOwnerMemberUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
