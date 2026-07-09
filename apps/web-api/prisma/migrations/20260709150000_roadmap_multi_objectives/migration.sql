-- CreateTable
CREATE TABLE "RoadmapItemObjective" (
    "id" SERIAL NOT NULL,
    "itemUid" TEXT NOT NULL,
    "objectiveUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapItemObjective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoadmapItemObjective_itemUid_idx" ON "RoadmapItemObjective"("itemUid");

-- CreateIndex
CREATE INDEX "RoadmapItemObjective_objectiveUid_idx" ON "RoadmapItemObjective"("objectiveUid");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItemObjective_itemUid_objectiveUid_key" ON "RoadmapItemObjective"("itemUid", "objectiveUid");

-- AddForeignKey
ALTER TABLE "RoadmapItemObjective" ADD CONSTRAINT "RoadmapItemObjective_itemUid_fkey" FOREIGN KEY ("itemUid") REFERENCES "RoadmapItem"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItemObjective" ADD CONSTRAINT "RoadmapItemObjective_objectiveUid_fkey" FOREIGN KEY ("objectiveUid") REFERENCES "RoadmapObjective"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single-objective assignments into the join table
INSERT INTO "RoadmapItemObjective" ("itemUid", "objectiveUid", "createdAt")
SELECT "uid", "objectiveUid", CURRENT_TIMESTAMP
FROM "RoadmapItem"
WHERE "objectiveUid" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "RoadmapItem" DROP CONSTRAINT "RoadmapItem_objectiveUid_fkey";

-- DropIndex
DROP INDEX "RoadmapItem_objectiveUid_idx";

-- AlterTable
ALTER TABLE "RoadmapItem" DROP COLUMN "objectiveUid";

-- Drafts: migrate singular objectiveUid → objectiveUids[]
ALTER TABLE "RoadmapSubmissionDraft" ADD COLUMN "objectiveUids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "RoadmapSubmissionDraft"
SET "objectiveUids" = ARRAY["objectiveUid"]
WHERE "objectiveUid" IS NOT NULL AND "objectiveUid" <> '';

ALTER TABLE "RoadmapSubmissionDraft" DROP COLUMN "objectiveUid";
