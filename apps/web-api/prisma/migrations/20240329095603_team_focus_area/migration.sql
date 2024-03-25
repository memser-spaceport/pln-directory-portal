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
CREATE TABLE "_teamFocusAreas" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "FocusArea_uid_key" ON "FocusArea"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "FocusArea_title_key" ON "FocusArea"("title");

-- CreateIndex
CREATE UNIQUE INDEX "_teamFocusAreas_AB_unique" ON "_teamFocusAreas"("A", "B");

-- CreateIndex
CREATE INDEX "_teamFocusAreas_B_index" ON "_teamFocusAreas"("B");

-- AddForeignKey
ALTER TABLE "FocusArea" ADD CONSTRAINT "FocusArea_parentUid_fkey" FOREIGN KEY ("parentUid") REFERENCES "FocusArea"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_teamFocusAreas" ADD CONSTRAINT "_teamFocusAreas_A_fkey" FOREIGN KEY ("A") REFERENCES "FocusArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_teamFocusAreas" ADD CONSTRAINT "_teamFocusAreas_B_fkey" FOREIGN KEY ("B") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
