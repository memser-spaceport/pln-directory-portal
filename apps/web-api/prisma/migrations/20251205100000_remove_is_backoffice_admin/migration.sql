-- Drop the isBackofficeAdmin column from Member table
-- Back-office access is now determined by AdminRole
ALTER TABLE "Member" DROP COLUMN IF EXISTS "isBackofficeAdmin";
