-- AlterTable: Add new columns minTypicalCheckSize and maxTypicalCheckSize
ALTER TABLE "InvestorProfile" ADD COLUMN "minTypicalCheckSize" DOUBLE PRECISION;
ALTER TABLE "InvestorProfile" ADD COLUMN "maxTypicalCheckSize" DOUBLE PRECISION;

-- Data migration: Copy each row's typicalCheckSize value to both min and max fields
UPDATE "InvestorProfile"
SET
    "minTypicalCheckSize" = "InvestorProfile"."typicalCheckSize",
    "maxTypicalCheckSize" = "InvestorProfile"."typicalCheckSize"
WHERE "InvestorProfile"."typicalCheckSize" IS NOT NULL;

-- AlterTable: Drop old column typicalCheckSize
ALTER TABLE "InvestorProfile" DROP COLUMN "typicalCheckSize";
