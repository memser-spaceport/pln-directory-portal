ALTER TABLE "InvestorProfile"
  ADD COLUMN "investInStartupStages" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "investInFundTypes"     TEXT[] NOT NULL DEFAULT '{}';
