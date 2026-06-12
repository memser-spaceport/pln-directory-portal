-- Path-level corrections: denormalize the target investor onto the correction row,
-- and normalize legacy rows where subjectType carried the corrected attribute
-- ('caliber' / 'connector') instead of the id domain of subjectId ('path').

-- AlterTable
ALTER TABLE "PathfinderCorrection" ADD COLUMN "targetInvestorId" VARCHAR(64);

-- CreateIndex
CREATE INDEX "PathfinderCorrection_targetInvestorId_idx" ON "PathfinderCorrection"("targetInvestorId");

-- Legacy rows written by the first warm-intros UI: subjectType 'caliber' / 'connector'
-- with a PathfinderPath.id in subjectId were path corrections. Rewrite them so
-- subjectType uniformly names the id domain.
UPDATE "PathfinderCorrection" pc
SET "subjectType" = 'path'
WHERE pc."subjectType" IN ('caliber', 'connector')
  AND pc."subjectId" ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM "PathfinderPath" p WHERE p."id" = pc."subjectId"::int);

-- Backfill the denormalized target investor for path corrections whose path rows
-- still exist (path rows are batch-replaced per ingest run, so some may be gone).
UPDATE "PathfinderCorrection" pc
SET "targetInvestorId" = p."targetInvestorId"
FROM "PathfinderPath" p
WHERE pc."subjectType" = 'path'
  AND pc."targetInvestorId" IS NULL
  AND pc."subjectId" ~ '^[0-9]+$'
  AND p."id" = pc."subjectId"::int;
