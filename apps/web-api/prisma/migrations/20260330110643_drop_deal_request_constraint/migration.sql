-- AlterTable
ALTER TABLE "DealIssue" ALTER COLUMN "dealUid" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DealRedemption" ALTER COLUMN "dealUid" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DealUsage" ALTER COLUMN "dealUid" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DealRequest" ALTER COLUMN "dealUid" DROP NOT NULL;

