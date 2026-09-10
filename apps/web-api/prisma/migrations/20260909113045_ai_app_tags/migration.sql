-- AlterTable
ALTER TABLE "AiApp" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
