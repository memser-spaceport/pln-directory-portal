-- LAB-3263: digest More / Less like this move interest profile topic weights, not news tags.
ALTER TABLE "LabosDigestChoice" ADD COLUMN "beforeWeights" JSONB;
ALTER TABLE "LabosDigestChoice" ADD COLUMN "afterWeights" JSONB;
