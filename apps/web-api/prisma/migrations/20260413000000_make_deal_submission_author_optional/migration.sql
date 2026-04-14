-- AlterTable
ALTER TABLE "DealSubmission" ALTER COLUMN "authorMemberUid" DROP NOT NULL;

-- Modify the foreign key constraint to allow SET NULL on delete
ALTER TABLE "DealSubmission" DROP CONSTRAINT IF EXISTS "DealSubmission_authorMemberUid_fkey";
ALTER TABLE "DealSubmission" ADD CONSTRAINT "DealSubmission_authorMemberUid_fkey" 
  FOREIGN KEY ("authorMemberUid") REFERENCES "Member"(uid) ON DELETE SET NULL ON UPDATE CASCADE;
