-- CreateTable
CREATE TABLE "ProjectFocusArea" (
    "id" SERIAL NOT NULL,
    "projectUid" TEXT NOT NULL,
    "focusAreaUid" TEXT NOT NULL,
    "ancestorAreaUid" TEXT NOT NULL,

    CONSTRAINT "ProjectFocusArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFocusArea_focusAreaUid_projectUid_ancestorAreaUid_key" ON "ProjectFocusArea"("focusAreaUid", "projectUid", "ancestorAreaUid");

-- AddForeignKey
ALTER TABLE "ProjectFocusArea" ADD CONSTRAINT "ProjectFocusArea_projectUid_fkey" FOREIGN KEY ("projectUid") REFERENCES "Project"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFocusArea" ADD CONSTRAINT "ProjectFocusArea_focusAreaUid_fkey" FOREIGN KEY ("focusAreaUid") REFERENCES "FocusArea"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFocusArea" ADD CONSTRAINT "ProjectFocusArea_ancestorAreaUid_fkey" FOREIGN KEY ("ancestorAreaUid") REFERENCES "FocusArea"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
