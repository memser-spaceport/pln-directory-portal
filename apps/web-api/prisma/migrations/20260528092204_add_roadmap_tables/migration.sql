-- CreateEnum
CREATE TYPE "RoadmapStage" AS ENUM ('IDEA', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED');

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "acceptanceCriteria" TEXT,
    "stage" "RoadmapStage" NOT NULL DEFAULT 'IDEA',
    "focusAreaUid" TEXT,
    "createdByUid" TEXT NOT NULL,
    "promotedAt" TIMESTAMP(3),
    "promotedByUid" TEXT,
    "declinedReason" TEXT,
    "externalTrackerUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapItemUpvote" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "itemUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapItemUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItem_uid_key" ON "RoadmapItem"("uid");

-- CreateIndex
CREATE INDEX "RoadmapItem_stage_deletedAt_idx" ON "RoadmapItem"("stage", "deletedAt");

-- CreateIndex
CREATE INDEX "RoadmapItem_createdByUid_idx" ON "RoadmapItem"("createdByUid");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItemUpvote_uid_key" ON "RoadmapItemUpvote"("uid");

-- CreateIndex
CREATE INDEX "RoadmapItemUpvote_memberUid_idx" ON "RoadmapItemUpvote"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItemUpvote_itemUid_memberUid_key" ON "RoadmapItemUpvote"("itemUid", "memberUid");

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_focusAreaUid_fkey" FOREIGN KEY ("focusAreaUid") REFERENCES "FocusArea"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_createdByUid_fkey" FOREIGN KEY ("createdByUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_promotedByUid_fkey" FOREIGN KEY ("promotedByUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItemUpvote" ADD CONSTRAINT "RoadmapItemUpvote_itemUid_fkey" FOREIGN KEY ("itemUid") REFERENCES "RoadmapItem"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItemUpvote" ADD CONSTRAINT "RoadmapItemUpvote_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
