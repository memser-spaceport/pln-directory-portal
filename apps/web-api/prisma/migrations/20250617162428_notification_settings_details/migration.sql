-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "byIndustryTag" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "focusAreaList" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fundingStageList" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "industryTagList" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "roleList" TEXT[] DEFAULT ARRAY[]::TEXT[];
