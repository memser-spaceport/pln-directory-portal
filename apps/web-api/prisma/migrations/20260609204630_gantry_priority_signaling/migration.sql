-- AlterTable
ALTER TABLE "RoadmapItem" ADD COLUMN     "objectiveUid" TEXT,
ALTER COLUMN "order" SET DEFAULT 99,
ALTER COLUMN "order" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "RoadmapItemPin" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "itemUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "note" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapItemPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapObjective" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pinLimit" INTEGER NOT NULL DEFAULT 3,
    "updatedByUid" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItemPin_uid_key" ON "RoadmapItemPin"("uid");

-- CreateIndex
CREATE INDEX "RoadmapItemPin_itemUid_releasedAt_idx" ON "RoadmapItemPin"("itemUid", "releasedAt");

-- CreateIndex
CREATE INDEX "RoadmapItemPin_memberUid_releasedAt_idx" ON "RoadmapItemPin"("memberUid", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapObjective_uid_key" ON "RoadmapObjective"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapObjective_title_key" ON "RoadmapObjective"("title");

-- CreateIndex
CREATE INDEX "RoadmapItem_objectiveUid_idx" ON "RoadmapItem"("objectiveUid");

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_objectiveUid_fkey" FOREIGN KEY ("objectiveUid") REFERENCES "RoadmapObjective"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItemPin" ADD CONSTRAINT "RoadmapItemPin_itemUid_fkey" FOREIGN KEY ("itemUid") REFERENCES "RoadmapItem"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItemPin" ADD CONSTRAINT "RoadmapItemPin_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapObjective" ADD CONSTRAINT "RoadmapObjective_createdByUid_fkey" FOREIGN KEY ("createdByUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (manual): only one ACTIVE pin per member per item; released history rows are exempt
CREATE UNIQUE INDEX "RoadmapItemPin_active_item_member_key" ON "RoadmapItemPin"("itemUid", "memberUid") WHERE "releasedAt" IS NULL;
