-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "byKeyword" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "byTechnology" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "keywordList" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "technologyList" TEXT[] DEFAULT ARRAY[]::TEXT[];
