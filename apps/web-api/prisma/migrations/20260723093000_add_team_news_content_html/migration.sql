-- Store the richer modal body produced by news enrichment.
ALTER TABLE "TeamNewsItem" ADD COLUMN "contentHtml" TEXT;

-- Existing summaries are plain text. Escape basic HTML-sensitive characters
-- and wrap them in a paragraph so old rows also have modal content.
UPDATE "TeamNewsItem"
SET "contentHtml" = '<p>' || "summary" || '</p>'
WHERE "summary" IS NOT NULL
  AND "contentHtml" IS NULL;
