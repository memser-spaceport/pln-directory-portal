-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "ohHelpWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ohInterest" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ohStatus" TEXT;

UPDATE "Member" 
SET "ohInterest" = '{}' 
WHERE "ohInterest" IS NULL;

UPDATE "Member"
SET "ohHelpWith" = '{}'
WHERE "ohHelpWith" IS NULL;