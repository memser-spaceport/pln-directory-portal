-- CreateTable
CREATE TABLE "FocusArea" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentUid" TEXT,

    CONSTRAINT "FocusArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamFocusArea" (
    "id" SERIAL NOT NULL,
    "teamUid" TEXT NOT NULL,
    "focusAreaUid" TEXT NOT NULL,
    "ancestorAreaUid" TEXT NOT NULL,

    CONSTRAINT "TeamFocusArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusAreaHierarchy" (
    "id" SERIAL NOT NULL,
    "isDirect" BOOLEAN NOT NULL,
    "focusAreaUid" TEXT NOT NULL,
    "subFocusAreaUid" TEXT NOT NULL,

    CONSTRAINT "FocusAreaHierarchy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FocusArea_uid_key" ON "FocusArea"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "FocusArea_title_key" ON "FocusArea"("title");

-- CreateIndex
CREATE UNIQUE INDEX "TeamFocusArea_focusAreaUid_teamUid_ancestorAreaUid_key" ON "TeamFocusArea"("focusAreaUid", "teamUid", "ancestorAreaUid");

-- AddForeignKey
ALTER TABLE "FocusArea" ADD CONSTRAINT "FocusArea_parentUid_fkey" FOREIGN KEY ("parentUid") REFERENCES "FocusArea"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFocusArea" ADD CONSTRAINT "TeamFocusArea_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFocusArea" ADD CONSTRAINT "TeamFocusArea_focusAreaUid_fkey" FOREIGN KEY ("focusAreaUid") REFERENCES "FocusArea"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFocusArea" ADD CONSTRAINT "TeamFocusArea_ancestorAreaUid_fkey" FOREIGN KEY ("ancestorAreaUid") REFERENCES "FocusArea"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusAreaHierarchy" ADD CONSTRAINT "FocusAreaHierarchy_focusAreaUid_fkey" FOREIGN KEY ("focusAreaUid") REFERENCES "FocusArea"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusAreaHierarchy" ADD CONSTRAINT "FocusAreaHierarchy_subFocusAreaUid_fkey" FOREIGN KEY ("subFocusAreaUid") REFERENCES "FocusArea"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
