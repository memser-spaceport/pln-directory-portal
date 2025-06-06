-- CreateTable
CREATE TABLE "RecommendationNotification" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "recommendationRunUid" TEXT NOT NULL,
    "targetMemberUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_NotificationRecommendations" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationNotification_uid_key" ON "RecommendationNotification"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "_NotificationRecommendations_AB_unique" ON "_NotificationRecommendations"("A", "B");

-- CreateIndex
CREATE INDEX "_NotificationRecommendations_B_index" ON "_NotificationRecommendations"("B");

-- AddForeignKey
ALTER TABLE "RecommendationNotification" ADD CONSTRAINT "RecommendationNotification_recommendationRunUid_fkey" FOREIGN KEY ("recommendationRunUid") REFERENCES "RecommendationRun"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationNotification" ADD CONSTRAINT "RecommendationNotification_targetMemberUid_fkey" FOREIGN KEY ("targetMemberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationRecommendations" ADD CONSTRAINT "_NotificationRecommendations_A_fkey" FOREIGN KEY ("A") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationRecommendations" ADD CONSTRAINT "_NotificationRecommendations_B_fkey" FOREIGN KEY ("B") REFERENCES "RecommendationNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
