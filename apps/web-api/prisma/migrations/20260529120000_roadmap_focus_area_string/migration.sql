-- Convert RoadmapItem.focusArea from a FocusArea foreign key to a free-form string.
-- DropForeignKey
ALTER TABLE "RoadmapItem" DROP CONSTRAINT "RoadmapItem_focusAreaUid_fkey";

-- AlterTable
ALTER TABLE "RoadmapItem" DROP COLUMN "focusAreaUid",
ADD COLUMN     "focusArea" TEXT;
