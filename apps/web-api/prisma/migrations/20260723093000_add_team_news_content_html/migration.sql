-- Store the richer modal body produced by news enrichment.
ALTER TABLE "TeamNewsItem"
  ADD COLUMN "contentHtml" TEXT;

-- Backfill existing plain-text summaries as safe paragraph HTML.
UPDATE "TeamNewsItem"
SET "contentHtml" =
      '<p>' ||
      replace(
        replace(
          replace("summary", '&', '&amp;'),
          '<', '&lt;'
        ),
        '>', '&gt;'
      ) ||
      '</p>'
WHERE "summary" IS NOT NULL
  AND "contentHtml" IS NULL;
