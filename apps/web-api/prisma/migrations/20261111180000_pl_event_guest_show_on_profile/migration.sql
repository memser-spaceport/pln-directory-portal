-- Whether a member's attendance shows on their profile's Events section (LAB-3211). Existing rows stay shown.
ALTER TABLE "PLEventGuest" ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true;
