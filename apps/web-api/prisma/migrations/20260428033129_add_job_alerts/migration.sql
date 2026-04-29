-- CreateTable
CREATE TABLE "JobAlert" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "filterState" JSONB NOT NULL,
    "filterStateHash" TEXT NOT NULL,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAlertSendRun" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "alertUid" TEXT NOT NULL,
    "ingestRunId" TEXT NOT NULL,
    "matchCount" INTEGER NOT NULL,
    "emailType" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAlertSendRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobAlert_uid_key" ON "JobAlert"("uid");

-- CreateIndex
CREATE INDEX "JobAlert_memberUid_createdAt_idx" ON "JobAlert"("memberUid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobAlert_isPaused_deletedAt_idx" ON "JobAlert"("isPaused", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobAlert_memberUid_filterStateHash_key" ON "JobAlert"("memberUid", "filterStateHash");

-- CreateIndex
CREATE UNIQUE INDEX "JobAlertSendRun_uid_key" ON "JobAlertSendRun"("uid");

-- CreateIndex
CREATE INDEX "JobAlertSendRun_ingestRunId_idx" ON "JobAlertSendRun"("ingestRunId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAlertSendRun_alertUid_ingestRunId_key" ON "JobAlertSendRun"("alertUid", "ingestRunId");

-- AddForeignKey
ALTER TABLE "JobAlert" ADD CONSTRAINT "JobAlert_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAlertSendRun" ADD CONSTRAINT "JobAlertSendRun_alertUid_fkey" FOREIGN KEY ("alertUid") REFERENCES "JobAlert"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
