-- AI Apps feedback: the reporter's kind (bug / request / question / chore) and
-- priority (P0–P3) from the written form. Both nullable with no default: rows
-- already stored, comments and older clients keep them empty. Nothing is backfilled.

DO $$ BEGIN
  CREATE TYPE "AiAppFeedbackReportKind" AS ENUM ('bug', 'request', 'question', 'chore');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AiAppFeedbackPriority" AS ENUM ('P0', 'P1', 'P2', 'P3');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AiAppFeedback" ADD COLUMN IF NOT EXISTS "reportKind" "AiAppFeedbackReportKind";
ALTER TABLE "AiAppFeedback" ADD COLUMN IF NOT EXISTS "priority" "AiAppFeedbackPriority";
