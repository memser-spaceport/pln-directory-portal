CREATE TABLE IF NOT EXISTS "DemoDayExpressInterestStatistic"
(
  "id"                        SERIAL PRIMARY KEY,
  "uid"                       TEXT         NOT NULL UNIQUE,
  "demoDayUid"                TEXT         NOT NULL,
  "memberUid"                 TEXT         NOT NULL,
  "teamFundraisingProfileUid" TEXT         NOT NULL,
  "isPrepDemoDay"             BOOLEAN      NOT NULL DEFAULT FALSE,
  "liked"                     BOOLEAN      NOT NULL DEFAULT FALSE,
  "connected"                 BOOLEAN      NOT NULL DEFAULT FALSE,
  "invested"                  BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"                 TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "DemoDayExpressInterestStatistic_memberUid_teamFundraisingPr_idx" ON "DemoDayExpressInterestStatistic"("memberUid", "teamFundraisingProfileUid");

-- CreateIndex
CREATE INDEX "DemoDayExpressInterestStatistic_demoDayUid_idx" ON "DemoDayExpressInterestStatistic"("demoDayUid");

-- CreateIndex
CREATE UNIQUE INDEX "DemoDayExpressInterestStatistic_demoDayUid_memberUid_teamFu_key" ON "DemoDayExpressInterestStatistic"("demoDayUid", "memberUid", "teamFundraisingProfileUid", "isPrepDemoDay");

-- AddForeignKey
ALTER TABLE "DemoDayExpressInterestStatistic" ADD CONSTRAINT "DemoDayExpressInterestStatistic_demoDayUid_fkey" FOREIGN KEY ("demoDayUid") REFERENCES "DemoDay"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoDayExpressInterestStatistic" ADD CONSTRAINT "DemoDayExpressInterestStatistic_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoDayExpressInterestStatistic" ADD CONSTRAINT "DemoDayExpressInterestStatistic_teamFundraisingProfileUid_fkey" FOREIGN KEY ("teamFundraisingProfileUid") REFERENCES "TeamFundraisingProfile"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
