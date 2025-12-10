-- Drop the isBackofficeAdmin column from Member table
-- Back-office access is now determined by MemberRole
ALTER TABLE "Member" DROP COLUMN IF EXISTS "isBackofficeAdmin";
