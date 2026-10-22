-- One-investor refresh rows. The weekly job keeps a single RUNNING row
-- with a null investor. Each investor may have one RUNNING row of its own.

ALTER TABLE "WarmIntrosV2Run" ADD COLUMN "investorProfileUid" TEXT;

DROP INDEX "WarmIntrosV2Run_one_running_idx";

CREATE UNIQUE INDEX "WarmIntrosV2Run_one_weekly_running_idx"
  ON "WarmIntrosV2Run" ("status")
  WHERE "status" = 'RUNNING' AND "investorProfileUid" IS NULL;

CREATE UNIQUE INDEX "WarmIntrosV2Run_one_investor_running_idx"
  ON "WarmIntrosV2Run" ("investorProfileUid")
  WHERE "status" = 'RUNNING' AND "investorProfileUid" IS NOT NULL;

CREATE INDEX "WarmIntrosV2Run_investorProfileUid_idx" ON "WarmIntrosV2Run"("investorProfileUid");
