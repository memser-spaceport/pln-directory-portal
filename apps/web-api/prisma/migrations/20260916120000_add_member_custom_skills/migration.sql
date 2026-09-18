-- AlterTable
ALTER TABLE "Member" ADD COLUMN "customSkills" TEXT[] DEFAULT ARRAY[]::TEXT[];
