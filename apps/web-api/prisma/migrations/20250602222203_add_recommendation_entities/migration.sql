-- CreateEnum
CREATE TYPE "RecommendationRunStatus" AS ENUM ('OPEN', 'CLOSED', 'SENT');

-- CreateTable
CREATE TABLE "RecommendationRun" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "targetMemberUid" TEXT NOT NULL,
    "status" "RecommendationRunStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "recommendationRunUid" TEXT NOT NULL,
    "recommendedMemberUid" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationRun_uid_key" ON "RecommendationRun"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_uid_key" ON "Recommendation"("uid");

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_targetMemberUid_fkey" FOREIGN KEY ("targetMemberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_recommendationRunUid_fkey" FOREIGN KEY ("recommendationRunUid") REFERENCES "RecommendationRun"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_recommendedMemberUid_fkey" FOREIGN KEY ("recommendedMemberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
