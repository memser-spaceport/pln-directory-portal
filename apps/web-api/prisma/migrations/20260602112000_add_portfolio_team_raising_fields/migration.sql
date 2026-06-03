-- AlterTable
ALTER TABLE "PlPortfolioTeamMeta"
ADD COLUMN "lastRoundStage" TEXT,
ADD COLUMN "lastRoundDate" DATE,
ADD COLUMN "raisingStage" TEXT,
ADD COLUMN "raisingAsOf" DATE,
ADD COLUMN "raisingSource" VARCHAR(120);
