-- CreateTable
CREATE TABLE "DemoDayFeedback" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "demoDayUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "qualityComments" TEXT,
    "improvementComments" TEXT,
    "comment" TEXT,
    "issues" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoDayFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoDayFeedback_uid_key" ON "DemoDayFeedback"("uid");

-- CreateIndex
CREATE INDEX "DemoDayFeedback_demoDayUid_idx" ON "DemoDayFeedback"("demoDayUid");

-- CreateIndex
CREATE UNIQUE INDEX "DemoDayFeedback_demoDayUid_memberUid_key" ON "DemoDayFeedback"("demoDayUid", "memberUid");

-- AddForeignKey
ALTER TABLE "DemoDayFeedback" ADD CONSTRAINT "DemoDayFeedback_demoDayUid_fkey" FOREIGN KEY ("demoDayUid") REFERENCES "DemoDay"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoDayFeedback" ADD CONSTRAINT "DemoDayFeedback_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
