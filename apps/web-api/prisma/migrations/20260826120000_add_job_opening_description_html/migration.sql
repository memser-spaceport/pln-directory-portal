-- Full posting HTML for the job drawer. Nullable: snippet `summary` remains
-- the fallback when enrichment cannot produce a description.
ALTER TABLE "JobOpening" ADD COLUMN "descriptionHtml" TEXT;
