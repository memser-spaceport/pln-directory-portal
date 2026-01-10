-- Allow creating IRL Gathering attendees without binding them to a specific event.
-- We store locationUid on PLEventGuest and make eventUid nullable.

ALTER TABLE "PLEventGuest" ADD COLUMN IF NOT EXISTS "locationUid" TEXT;

-- eventUid becomes optional (nullable)
ALTER TABLE "PLEventGuest" ALTER COLUMN "eventUid" DROP NOT NULL;

-- Backfill locationUid for existing event-level guests
UPDATE "PLEventGuest" pg
SET "locationUid" = e."locationUid"
FROM "PLEvent" e
WHERE pg."eventUid" = e."uid";

-- Make locationUid required after backfill
ALTER TABLE "PLEventGuest" ALTER COLUMN "locationUid" SET NOT NULL;

-- Add FK to PLEventLocation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PLEventGuest_locationUid_fkey'
  ) THEN
    ALTER TABLE "PLEventGuest"
      ADD CONSTRAINT "PLEventGuest_locationUid_fkey"
      FOREIGN KEY ("locationUid") REFERENCES "PLEventLocation"("uid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

