-- Where in the element a feedback pin was clicked (fraction of its box, 0–1),
-- so the pin sits on that spot. Null for pins made before it was recorded.
ALTER TABLE "AiAppFeedbackPin" ADD COLUMN IF NOT EXISTS "ox" DOUBLE PRECISION;
ALTER TABLE "AiAppFeedbackPin" ADD COLUMN IF NOT EXISTS "oy" DOUBLE PRECISION;
