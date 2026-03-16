-- CreateTable
CREATE TABLE "CommunityAffiliation" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CommunityAffiliationToTeam" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityAffiliation_uid_key" ON "CommunityAffiliation"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityAffiliation_title_key" ON "CommunityAffiliation"("title");

-- CreateIndex
CREATE UNIQUE INDEX "_CommunityAffiliationToTeam_AB_unique" ON "_CommunityAffiliationToTeam"("A", "B");

-- CreateIndex
CREATE INDEX "_CommunityAffiliationToTeam_B_index" ON "_CommunityAffiliationToTeam"("B");

-- AddForeignKey
ALTER TABLE "_CommunityAffiliationToTeam" ADD CONSTRAINT "_CommunityAffiliationToTeam_A_fkey" FOREIGN KEY ("A") REFERENCES "CommunityAffiliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CommunityAffiliationToTeam" ADD CONSTRAINT "_CommunityAffiliationToTeam_B_fkey" FOREIGN KEY ("B") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed community affiliations
INSERT INTO "CommunityAffiliation" ("uid", "title", "createdAt", "updatedAt") VALUES
  ('cl-community-pl-portfolio', 'PL Portfolio', NOW(), NOW()),
  ('cl-community-yc', 'YC', NOW(), NOW()),
  ('cl-community-a16z', 'A16Z', NOW(), NOW()),
  ('cl-community-orange-dao', 'Orange DAO', NOW(), NOW()),
  ('cl-community-longhash', 'Longhash', NOW(), NOW()),
  ('cl-community-outlier-ventures', 'Outlier Ventures', NOW(), NOW()),
  ('cl-community-tachyon', 'Tachyon', NOW(), NOW()),
  ('cl-community-techstars', 'Techstars', NOW(), NOW()),
  ('cl-community-alliance', 'Alliance', NOW(), NOW()),
  ('cl-community-founder-school', 'Founder School', NOW(), NOW()),
  ('cl-community-cypher', 'Cypher', NOW(), NOW()),
  ('cl-community-faber', 'Faber', NOW(), NOW()),
  ('cl-community-aleph-crecimiento', 'Aleph Crecimiento', NOW(), NOW()),
  ('cl-community-edge-city', 'Edge City', NOW(), NOW()),
  ('cl-community-pl-genesis', 'PL Genesis', NOW(), NOW());
