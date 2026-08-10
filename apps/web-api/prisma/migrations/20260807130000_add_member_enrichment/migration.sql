-- Member Profile Enrichment sidecar (state/metadata only). Unlike TeamEnrichment,
-- there are no candidate scalar/array columns here — enriched values are written
-- directly to Member / TeamMemberRole / Skill; see docs/MEMBER_ENRICHMENT.md.

-- CreateTable
CREATE TABLE "MemberEnrichment" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "dataEnrichment" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberEnrichment_uid_key" ON "MemberEnrichment"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberEnrichment_memberUid_key" ON "MemberEnrichment"("memberUid");

-- AddForeignKey
ALTER TABLE "MemberEnrichment" ADD CONSTRAINT "MemberEnrichment_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
