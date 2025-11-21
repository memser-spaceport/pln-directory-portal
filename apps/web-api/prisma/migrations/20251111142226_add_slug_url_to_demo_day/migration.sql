-- AlterTable: Add slugURL column as nullable first
ALTER TABLE "DemoDay" ADD COLUMN "slugURL" TEXT;

-- Update existing records: Set slugURL = uid for all existing records
UPDATE "DemoDay" SET "slugURL" = "uid" WHERE "slugURL" IS NULL;

-- AlterTable: Make slugURL NOT NULL
ALTER TABLE "DemoDay" ALTER COLUMN "slugURL" SET NOT NULL;

-- CreateIndex: Add unique constraint on slugURL
CREATE UNIQUE INDEX "DemoDay_slugURL_key" ON "DemoDay"("slugURL");