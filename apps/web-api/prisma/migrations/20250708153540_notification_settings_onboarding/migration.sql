-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "lastOnboardingSentAt" TIMESTAMP(3),
ADD COLUMN     "onboardingAttempts" INTEGER NOT NULL DEFAULT 0;
