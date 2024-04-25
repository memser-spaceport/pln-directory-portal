-- DropForeignKey
ALTER TABLE "TeamFocusAreaVersionHistory" DROP CONSTRAINT "TeamFocusAreaVersionHistory_focusAreaUid_fkey";

-- AlterTable
ALTER TABLE "TeamFocusAreaVersionHistory" ALTER COLUMN "focusAreaUid" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TeamFocusAreaVersionHistory" ADD CONSTRAINT "TeamFocusAreaVersionHistory_focusAreaUid_fkey" FOREIGN KEY ("focusAreaUid") REFERENCES "FocusArea"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
