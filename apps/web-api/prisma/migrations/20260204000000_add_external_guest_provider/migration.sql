-- Add external event provider enum
CREATE TYPE "ExternalEventProvider" AS ENUM ('LUMA');

-- Add external event provider fields to PLEvent
ALTER TABLE "PLEvent" ADD COLUMN "externalEventProvider" "ExternalEventProvider";
ALTER TABLE "PLEvent" ADD COLUMN "externalEventId" TEXT;
ALTER TABLE "PLEvent" ADD COLUMN "guestLastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PLEventGuest" ADD COLUMN "externalGuestId" TEXT;

-- CreateIndex
CREATE INDEX "PLEventGuest_externalGuestId_idx" ON "PLEventGuest"("externalGuestId");

-- Create index for efficient querying
CREATE INDEX "PLEvent_externalEventProvider_externalEventId_idx" ON "PLEvent"("externalEventProvider", "externalEventId");

