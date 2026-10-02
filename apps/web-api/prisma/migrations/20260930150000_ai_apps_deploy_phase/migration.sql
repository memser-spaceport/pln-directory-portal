-- Background deploy job: progress checkpoint + owning attempt per deploy row.
ALTER TABLE "AiApp" ADD COLUMN "deployPhase" TEXT;
ALTER TABLE "AiApp" ADD COLUMN "deployAttemptId" TEXT;
ALTER TABLE "AiAppTarget" ADD COLUMN "deployPhase" TEXT;
ALTER TABLE "AiAppTarget" ADD COLUMN "deployAttemptId" TEXT;
