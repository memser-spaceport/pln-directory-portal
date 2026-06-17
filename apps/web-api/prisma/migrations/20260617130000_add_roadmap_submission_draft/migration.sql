-- CreateTable
CREATE TABLE "RoadmapSubmissionDraft" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'idea',
    "title" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" TEXT,
    "stage" TEXT,
    "objectiveUid" TEXT,
    "newObjectiveTitle" TEXT,
    "showCreateObjective" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapSubmissionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapSubmissionDraft_uid_key" ON "RoadmapSubmissionDraft"("uid");

-- CreateIndex (one active draft per member)
CREATE UNIQUE INDEX "RoadmapSubmissionDraft_memberUid_key" ON "RoadmapSubmissionDraft"("memberUid");

-- AddForeignKey
ALTER TABLE "RoadmapSubmissionDraft" ADD CONSTRAINT "RoadmapSubmissionDraft_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
