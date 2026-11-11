-- Policy codes an app is published to (LAB-3200). Existing apps get none, so nothing opens up.
ALTER TABLE "AiApp" ADD COLUMN "audiencePolicyCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterEnum
ALTER TYPE "AiAppEventType" ADD VALUE IF NOT EXISTS 'AUDIENCE_UPDATED';
