ALTER TABLE "Deal"
ADD COLUMN IF NOT EXISTS "audience" TEXT;

UPDATE "Deal"
SET "audience" = 'general'
WHERE "audience" IS NULL;

ALTER TABLE "Deal"
ALTER COLUMN "audience" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Deal_audience_idx" ON "Deal"("audience");
