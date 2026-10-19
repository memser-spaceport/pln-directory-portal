-- CreateTable
CREATE TABLE "ManualFieldLock" (
    "uid" TEXT NOT NULL,
    "subjectType" VARCHAR(32) NOT NULL,
    "subjectUid" TEXT NOT NULL,
    "field" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "actorUid" VARCHAR(64),
    "actorEmail" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualFieldLock_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualFieldLock_subjectType_subjectUid_field_key" ON "ManualFieldLock"("subjectType", "subjectUid", "field");

-- CreateIndex
CREATE INDEX "ManualFieldLock_subjectType_subjectUid_idx" ON "ManualFieldLock"("subjectType", "subjectUid");
