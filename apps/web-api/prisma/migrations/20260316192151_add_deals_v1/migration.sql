-- Deals v1
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEACTIVATED');

CREATE TABLE "Deal" (
  "id" SERIAL PRIMARY KEY,
  "uid" TEXT NOT NULL UNIQUE,
  "vendorName" TEXT NOT NULL,
  "vendorTeamUid" TEXT NULL,
  "logoUid" TEXT NULL,
  "category" TEXT NOT NULL,
  "shortDescription" TEXT NOT NULL,
  "fullDescription" TEXT NOT NULL,
  "redemptionInstructions" TEXT NOT NULL,
  "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "DealRedemption" (
  "id" SERIAL PRIMARY KEY,
  "uid" TEXT NOT NULL UNIQUE,
  "dealUid" TEXT NOT NULL,
  "memberUid" TEXT NOT NULL,
  "teamUid" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealRedemption_dealUid_memberUid_key" UNIQUE ("dealUid", "memberUid")
);

CREATE TABLE "DealUsage" (
  "id" SERIAL PRIMARY KEY,
  "uid" TEXT NOT NULL UNIQUE,
  "dealUid" TEXT NOT NULL,
  "memberUid" TEXT NOT NULL,
  "teamUid" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealUsage_dealUid_memberUid_key" UNIQUE ("dealUid", "memberUid")
);

CREATE TABLE "DealWhitelist" (
  "id" SERIAL PRIMARY KEY,
  "uid" TEXT NOT NULL UNIQUE,
  "memberUid" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Deal_status_idx" ON "Deal"("status");
CREATE INDEX "Deal_category_idx" ON "Deal"("category");
CREATE INDEX "Deal_vendorName_idx" ON "Deal"("vendorName");
CREATE INDEX "DealRedemption_dealUid_idx" ON "DealRedemption"("dealUid");
CREATE INDEX "DealRedemption_memberUid_idx" ON "DealRedemption"("memberUid");
CREATE INDEX "DealRedemption_teamUid_idx" ON "DealRedemption"("teamUid");
CREATE INDEX "DealUsage_dealUid_idx" ON "DealUsage"("dealUid");
CREATE INDEX "DealUsage_memberUid_idx" ON "DealUsage"("memberUid");
CREATE INDEX "DealUsage_teamUid_idx" ON "DealUsage"("teamUid");
CREATE INDEX "DealWhitelist_memberUid_idx" ON "DealWhitelist"("memberUid");

ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_vendorTeamUid_fkey"
  FOREIGN KEY ("vendorTeamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_logoUid_fkey"
  FOREIGN KEY ("logoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealRedemption"
  ADD CONSTRAINT "DealRedemption_dealUid_fkey"
  FOREIGN KEY ("dealUid") REFERENCES "Deal"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealRedemption"
  ADD CONSTRAINT "DealRedemption_memberUid_fkey"
  FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealRedemption"
  ADD CONSTRAINT "DealRedemption_teamUid_fkey"
  FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealUsage"
  ADD CONSTRAINT "DealUsage_dealUid_fkey"
  FOREIGN KEY ("dealUid") REFERENCES "Deal"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealUsage"
  ADD CONSTRAINT "DealUsage_memberUid_fkey"
  FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealUsage"
  ADD CONSTRAINT "DealUsage_teamUid_fkey"
  FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealWhitelist"
  ADD CONSTRAINT "DealWhitelist_memberUid_fkey"
  FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
