-- Per-app LabOS feedback. Existing apps stay on; an editor turns it off from Edit details.
ALTER TABLE "AiApp" ADD COLUMN "feedbackEnabled" BOOLEAN NOT NULL DEFAULT true;
