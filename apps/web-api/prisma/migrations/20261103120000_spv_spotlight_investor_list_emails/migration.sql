-- CreateTable
CREATE TABLE "SpvSpotlightInvestorListEntry" (
    "id" SERIAL NOT NULL,
    "listUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpvSpotlightInvestorListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpvSpotlightInvestorListEntry_listUid_email_key" ON "SpvSpotlightInvestorListEntry"("listUid", "email");

-- AddForeignKey
ALTER TABLE "SpvSpotlightInvestorListEntry" ADD CONSTRAINT "SpvSpotlightInvestorListEntry_listUid_fkey" FOREIGN KEY ("listUid") REFERENCES "SpvSpotlightInvestorList"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy each list's participants as emails, in list order
INSERT INTO "SpvSpotlightInvestorListEntry" ("listUid", "email", "createdAt")
SELECT lp."listUid", LOWER(TRIM(m."email")), lp."createdAt"
FROM "SpvSpotlightInvestorListParticipant" lp
JOIN "SpvSpotlightParticipant" p ON p."uid" = lp."participantUid"
JOIN "Member" m ON m."uid" = p."memberUid"
WHERE m."email" IS NOT NULL
ORDER BY lp."id"
ON CONFLICT ("listUid", "email") DO NOTHING;

-- DropForeignKey
ALTER TABLE "SpvSpotlightInvestorListParticipant" DROP CONSTRAINT "SpvSpotlightInvestorListParticipant_listUid_fkey";

-- DropForeignKey
ALTER TABLE "SpvSpotlightInvestorListParticipant" DROP CONSTRAINT "SpvSpotlightInvestorListParticipant_participantUid_fkey";

-- DropTable
DROP TABLE "SpvSpotlightInvestorListParticipant";
