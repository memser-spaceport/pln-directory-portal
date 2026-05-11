-- Add the new TeamEnrichment table, migrate legacy `Team.dataEnrichment` payload into it,
-- NULL out enriched Team scalars where the judge confidence isn't "high", then drop the old
-- column — all in one transaction so the cutover is atomic.

-- CreateTable
CREATE TABLE "TeamEnrichment" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "website" TEXT,
    "blog" TEXT,
    "contactMethod" TEXT,
    "twitterHandler" TEXT,
    "linkedinHandler" TEXT,
    "telegramHandler" TEXT,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "moreDetails" TEXT,
    "logoUid" TEXT,
    "industryTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investmentFocus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dataEnrichment" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamEnrichment_uid_key" ON "TeamEnrichment"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEnrichment_teamUid_key" ON "TeamEnrichment"("teamUid");

-- AddForeignKey
ALTER TABLE "TeamEnrichment" ADD CONSTRAINT "TeamEnrichment_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEnrichment" ADD CONSTRAINT "TeamEnrichment_logoUid_fkey" FOREIGN KEY ("logoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: copy every Team's legacy dataEnrichment payload into TeamEnrichment.
-- Per-field rule for the CANDIDATE values on TeamEnrichment:
--   - status === 'Enriched' → copy the value from Team (or InvestorProfile / M2M).
--   - any other status (ChangedByUser, CannotEnrich, no entry) → leave NULL/empty.
--
-- The deterministic uid `'te_' || t.uid` keeps backfilled rows unique without depending on
-- a cuid extension. New rows created by the app post-migration get cuids from Prisma.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "TeamEnrichment" (
    "uid",
    "teamUid",
    "website",
    "blog",
    "contactMethod",
    "twitterHandler",
    "linkedinHandler",
    "telegramHandler",
    "shortDescription",
    "longDescription",
    "moreDetails",
    "logoUid",
    "industryTags",
    "investmentFocus",
    "dataEnrichment",
    "updatedAt"
)
SELECT
    'te_' || t."uid",
    t."uid",
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'website'->>'status' = 'Enriched' THEN t."website" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'blog'->>'status' = 'Enriched' THEN t."blog" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'contactMethod'->>'status' = 'Enriched' THEN t."contactMethod" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'twitterHandler'->>'status' = 'Enriched' THEN t."twitterHandler" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'linkedinHandler'->>'status' = 'Enriched' THEN t."linkedinHandler" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'telegramHandler'->>'status' = 'Enriched' THEN t."telegramHandler" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'shortDescription'->>'status' = 'Enriched' THEN t."shortDescription" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'longDescription'->>'status' = 'Enriched' THEN t."longDescription" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'moreDetails'->>'status' = 'Enriched' THEN t."moreDetails" END,
    CASE WHEN t."dataEnrichment"->'fieldsMeta'->'logo'->>'status' = 'Enriched' THEN t."logoUid" END,
    CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'industryTags'->>'status' = 'Enriched' THEN
            COALESCE(
                (SELECT array_agg(it."title")
                 FROM "_IndustryTagToTeam" itt
                 JOIN "IndustryTag" it ON it."id" = itt."A"
                 WHERE itt."B" = t."id"),
                ARRAY[]::TEXT[]
            )
        ELSE ARRAY[]::TEXT[]
    END,
    CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'investmentFocus'->>'status' = 'Enriched' THEN
            COALESCE(
                (SELECT ip."investmentFocus" FROM "InvestorProfile" ip WHERE ip."uid" = t."investorProfileId"),
                ARRAY[]::TEXT[]
            )
        ELSE ARRAY[]::TEXT[]
    END,
    t."dataEnrichment",
    CURRENT_TIMESTAMP
FROM "Team" t
WHERE t."dataEnrichment" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- NULL the enriched scalar columns on Team for fields where the judge did NOT
-- promote to high confidence. ChangedByUser values are preserved (the status guard
-- filters them out), so user-supplied data is never touched.
--
-- Relational fields (industryTags M2M on Team, investmentFocus on InvestorProfile)
-- are intentionally NOT cleared here. They were the per-row M2M / array; the
-- candidate copy now lives on TeamEnrichment and the judge will overwrite the Team
-- side when it confirms at high confidence. Clearing them blindly here would
-- destroy any user-curated tags the team already had.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "Team" t SET
    "website" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'website'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'website'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."website" END,
    "blog" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'blog'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'blog'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."blog" END,
    "contactMethod" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'contactMethod'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'contactMethod'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."contactMethod" END,
    "twitterHandler" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'twitterHandler'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'twitterHandler'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."twitterHandler" END,
    "linkedinHandler" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'linkedinHandler'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'linkedinHandler'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."linkedinHandler" END,
    "telegramHandler" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'telegramHandler'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'telegramHandler'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."telegramHandler" END,
    "shortDescription" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'shortDescription'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'shortDescription'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."shortDescription" END,
    "longDescription" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'longDescription'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'longDescription'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."longDescription" END,
    "moreDetails" = CASE
        WHEN t."dataEnrichment"->'fieldsMeta'->'moreDetails'->>'status' = 'Enriched'
         AND COALESCE(t."dataEnrichment"->'fieldsMeta'->'moreDetails'->'judgment'->>'confidence', '') <> 'high'
        THEN NULL ELSE t."moreDetails" END
WHERE t."dataEnrichment" IS NOT NULL;

-- AlterTable: drop the legacy column now that data has moved to TeamEnrichment.
ALTER TABLE "Team" DROP COLUMN "dataEnrichment";
