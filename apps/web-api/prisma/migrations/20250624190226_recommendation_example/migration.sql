-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "exampleSent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RecommendationNotification" ADD COLUMN     "isExample" BOOLEAN NOT NULL DEFAULT false;
