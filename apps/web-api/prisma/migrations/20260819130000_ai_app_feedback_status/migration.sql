-- Shared review status on AI App feedback. Existing rows start as NEW.
CREATE TYPE "AiAppFeedbackStatus" AS ENUM ('NEW', 'VIEWED', 'IMPLEMENTED');

ALTER TABLE "AiAppFeedback"
  ADD COLUMN "status" "AiAppFeedbackStatus" NOT NULL DEFAULT 'NEW';
