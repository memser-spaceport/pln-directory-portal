-- Collapse frequency tier to high / neglected only (drop steady & cooling).
UPDATE "AffinityPerson"
SET "frequencyTier" = 'NEGLECTED'
WHERE "frequencyTier" IN ('STEADY', 'COOLING');

ALTER TYPE "AffinityFrequencyTier" RENAME TO "AffinityFrequencyTier_old";
CREATE TYPE "AffinityFrequencyTier" AS ENUM ('HIGH', 'NEGLECTED');

ALTER TABLE "AffinityPerson"
  ALTER COLUMN "frequencyTier" TYPE "AffinityFrequencyTier"
  USING ("frequencyTier"::text::"AffinityFrequencyTier");

DROP TYPE "AffinityFrequencyTier_old";
