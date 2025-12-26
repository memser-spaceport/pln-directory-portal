-- Migration: Update PushNotification and PushNotificationReadStatus to use Member.externalId instead of Member.uid
-- This allows WebSocket to use externalId directly without DB lookups

-- Step 1: Drop existing foreign key constraints
ALTER TABLE "PushNotification" DROP CONSTRAINT IF EXISTS "PushNotification_recipientUid_fkey";
ALTER TABLE "PushNotificationReadStatus" DROP CONSTRAINT IF EXISTS "PushNotificationReadStatus_memberUid_fkey";

-- Step 2: Update PushNotification.recipientUid from uid to externalId
UPDATE "PushNotification" pn
SET "recipientUid" = m."externalId"
FROM "Member" m
WHERE pn."recipientUid" = m."uid"
  AND m."externalId" IS NOT NULL;

-- Step 3: Update PushNotificationReadStatus.memberUid from uid to externalId
UPDATE "PushNotificationReadStatus" pnrs
SET "memberUid" = m."externalId"
FROM "Member" m
WHERE pnrs."memberUid" = m."uid"
  AND m."externalId" IS NOT NULL;

-- Step 4: Add new foreign key constraints referencing externalId
ALTER TABLE "PushNotification" ADD CONSTRAINT "PushNotification_recipientUid_fkey" FOREIGN KEY ("recipientUid") REFERENCES "Member"("externalId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushNotificationReadStatus" ADD CONSTRAINT "PushNotificationReadStatus_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("externalId") ON DELETE CASCADE ON UPDATE CASCADE;
