-- CreateTable
CREATE TABLE "SpvSpotlightInvestorList" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "spvSpotlightUid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpvSpotlightInvestorList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpvSpotlightInvestorListParticipant" (
    "id" SERIAL NOT NULL,
    "listUid" TEXT NOT NULL,
    "participantUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpvSpotlightInvestorListParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpvSpotlightInvestorList_uid_key" ON "SpvSpotlightInvestorList"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "SpvSpotlightInvestorList_spvSpotlightUid_name_key" ON "SpvSpotlightInvestorList"("spvSpotlightUid", "name");

-- CreateIndex
CREATE INDEX "SpvSpotlightInvestorListParticipant_participantUid_idx" ON "SpvSpotlightInvestorListParticipant"("participantUid");

-- CreateIndex
CREATE UNIQUE INDEX "SpvSpotlightInvestorListParticipant_listUid_participantUid_key" ON "SpvSpotlightInvestorListParticipant"("listUid", "participantUid");

-- AddForeignKey
ALTER TABLE "SpvSpotlightInvestorList" ADD CONSTRAINT "SpvSpotlightInvestorList_spvSpotlightUid_fkey" FOREIGN KEY ("spvSpotlightUid") REFERENCES "SpvSpotlight"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpvSpotlightInvestorListParticipant" ADD CONSTRAINT "SpvSpotlightInvestorListParticipant_listUid_fkey" FOREIGN KEY ("listUid") REFERENCES "SpvSpotlightInvestorList"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpvSpotlightInvestorListParticipant" ADD CONSTRAINT "SpvSpotlightInvestorListParticipant_participantUid_fkey" FOREIGN KEY ("participantUid") REFERENCES "SpvSpotlightParticipant"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

