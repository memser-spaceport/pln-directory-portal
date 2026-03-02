-- DropForeignKey (IF EXISTS: constraint may already be absent on some databases)
ALTER TABLE "PushNotification" DROP CONSTRAINT IF EXISTS "PushNotification_recipientUid_fkey";

-- DropForeignKey (IF EXISTS: constraint may already be absent on some databases)
ALTER TABLE "PushNotificationReadStatus" DROP CONSTRAINT IF EXISTS "PushNotificationReadStatus_memberUid_fkey";

-- BackfillData: PushNotification.recipientUid from externalId to member uid
UPDATE "PushNotification" pn
SET "recipientUid" = m."uid"
FROM "Member" m
WHERE pn."recipientUid" = m."externalId"
  AND m."externalId" IS NOT NULL;

-- BackfillData: Clean up orphaned private notifications
DELETE FROM "PushNotification"
WHERE "recipientUid" IS NOT NULL
  AND "isPublic" = false
  AND "recipientUid" NOT IN (SELECT "uid" FROM "Member");

-- BackfillData: PushNotificationReadStatus.memberUid from externalId to member uid
UPDATE "PushNotificationReadStatus" pnrs
SET "memberUid" = m."uid"
FROM "Member" m
WHERE pnrs."memberUid" = m."externalId"
  AND m."externalId" IS NOT NULL;

-- BackfillData: Clean up orphaned read statuses
DELETE FROM "PushNotificationReadStatus"
WHERE "memberUid" NOT IN (SELECT "uid" FROM "Member");

-- AddForeignKey
ALTER TABLE "PushNotification" ADD CONSTRAINT "PushNotification_recipientUid_fkey" FOREIGN KEY ("recipientUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushNotificationReadStatus" ADD CONSTRAINT "PushNotificationReadStatus_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
