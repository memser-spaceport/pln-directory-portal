-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "isFeatured" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "PLEvent" ADD COLUMN     "isFeatured" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isFeatured" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "isFeatured" BOOLEAN DEFAULT false;
