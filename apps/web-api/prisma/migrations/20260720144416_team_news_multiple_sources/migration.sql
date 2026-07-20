ALTER TABLE "TeamNewsItem"
ADD COLUMN "sourceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "TeamNewsItem"
SET "sourceUrls" = ARRAY["sourceUrl"]
WHERE cardinality("sourceUrls") = 0;
