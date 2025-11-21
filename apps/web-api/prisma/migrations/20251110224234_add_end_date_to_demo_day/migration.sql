-- AlterTable: Add endDate column as nullable first
ALTER TABLE "DemoDay" ADD COLUMN "endDate" TIMESTAMP(3);

-- Update existing records: Set endDate = startDate for all existing records
UPDATE "DemoDay" SET "endDate" = "startDate" WHERE "endDate" IS NULL;

-- AlterTable: Make endDate NOT NULL
ALTER TABLE "DemoDay" ALTER COLUMN "endDate" SET NOT NULL;