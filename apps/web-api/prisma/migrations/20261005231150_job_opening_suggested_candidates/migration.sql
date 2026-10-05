-- CreateTable
CREATE TABLE "MemberMatchEmbedding" (
    "id" SERIAL NOT NULL,
    "memberUid" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberMatchEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOpeningCandidateSuggestionSet" (
    "id" SERIAL NOT NULL,
    "jobOpeningUid" TEXT NOT NULL,
    "criteria" TEXT[],
    "sourceHash" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpeningCandidateSuggestionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOpeningSuggestedCandidate" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "jobOpeningUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,
    "criteriaResults" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOpeningSuggestedCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberMatchEmbedding_memberUid_key" ON "MemberMatchEmbedding"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpeningCandidateSuggestionSet_jobOpeningUid_key" ON "JobOpeningCandidateSuggestionSet"("jobOpeningUid");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpeningSuggestedCandidate_uid_key" ON "JobOpeningSuggestedCandidate"("uid");

-- CreateIndex
CREATE INDEX "JobOpeningSuggestedCandidate_jobOpeningUid_rank_idx" ON "JobOpeningSuggestedCandidate"("jobOpeningUid", "rank");

-- CreateIndex
CREATE INDEX "JobOpeningSuggestedCandidate_memberUid_idx" ON "JobOpeningSuggestedCandidate"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpeningSuggestedCandidate_jobOpeningUid_memberUid_key" ON "JobOpeningSuggestedCandidate"("jobOpeningUid", "memberUid");

-- AddForeignKey
ALTER TABLE "MemberMatchEmbedding" ADD CONSTRAINT "MemberMatchEmbedding_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpeningCandidateSuggestionSet" ADD CONSTRAINT "JobOpeningCandidateSuggestionSet_jobOpeningUid_fkey" FOREIGN KEY ("jobOpeningUid") REFERENCES "JobOpening"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpeningSuggestedCandidate" ADD CONSTRAINT "JobOpeningSuggestedCandidate_jobOpeningUid_fkey" FOREIGN KEY ("jobOpeningUid") REFERENCES "JobOpening"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpeningSuggestedCandidate" ADD CONSTRAINT "JobOpeningSuggestedCandidate_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

