-- AlterTable
ALTER TABLE "DemoDay" ADD COLUMN     "programFieldEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "programFieldOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stageTagEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DemoDayBranding" ADD COLUMN     "headerImageUid" TEXT,
ADD COLUMN     "landingLogosEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "primaryColor" TEXT NOT NULL DEFAULT '#1a45e6';

-- AddForeignKey
ALTER TABLE "DemoDayBranding" ADD CONSTRAINT "DemoDayBranding_headerImageUid_fkey" FOREIGN KEY ("headerImageUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
