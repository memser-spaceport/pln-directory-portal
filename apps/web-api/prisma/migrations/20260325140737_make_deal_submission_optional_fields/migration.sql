-- Make optional fields nullable in DealSubmission
ALTER TABLE "DealSubmission"
  ALTER COLUMN "vendorName" DROP NOT NULL,
  ALTER COLUMN "category" DROP NOT NULL,
  ALTER COLUMN "audience" DROP NOT NULL;
