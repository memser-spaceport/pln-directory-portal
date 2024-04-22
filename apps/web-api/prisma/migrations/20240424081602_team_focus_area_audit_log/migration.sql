-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "lastModifiedBy" TEXT;

-- CreateTable
CREATE TABLE "TeamFocusAreaVersionHistory" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "focusAreaUid" TEXT NOT NULL,
    "focusAreaTitle" TEXT,
    "modifiedBy" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamFocusAreaVersionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamFocusAreaVersionHistory_uid_key" ON "TeamFocusAreaVersionHistory"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamFocusAreaVersionHistory_focusAreaUid_teamUid_version_key" ON "TeamFocusAreaVersionHistory"("focusAreaUid", "teamUid", "version");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFocusAreaVersionHistory" ADD CONSTRAINT "TeamFocusAreaVersionHistory_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFocusAreaVersionHistory" ADD CONSTRAINT "TeamFocusAreaVersionHistory_focusAreaUid_fkey" FOREIGN KEY ("focusAreaUid") REFERENCES "FocusArea"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFocusAreaVersionHistory" ADD CONSTRAINT "TeamFocusAreaVersionHistory_modifiedBy_fkey" FOREIGN KEY ("modifiedBy") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
