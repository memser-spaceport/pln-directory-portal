-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "exampleAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastExampleSentAt" TIMESTAMP(3);

-- Update exampleAttempts for members who have already received example emails
UPDATE "NotificationSetting" 
SET "exampleAttempts" = 1 
WHERE "exampleSent" = true;

