-- CreateEnum
CREATE TYPE "ImageSize" AS ENUM ('ORIGINAL', 'LARGE', 'MEDIUM', 'SMALL', 'TINY');

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUid" TEXT,
    "blog" TEXT,
    "website" TEXT,
    "contactMethod" TEXT,
    "twitterHandler" TEXT,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "plnFriend" BOOLEAN NOT NULL,
    "airtableRecId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fundingStageUid" TEXT,
    "filecoinUser" BOOLEAN NOT NULL,
    "ipfsUser" BOOLEAN NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "imageUid" TEXT,
    "githubHandler" TEXT,
    "discordHandler" TEXT,
    "twitterHandler" TEXT,
    "officeHours" TEXT,
    "plnFriend" BOOLEAN NOT NULL,
    "airtableRecId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "locationUid" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT NOT NULL,
    "continent" TEXT NOT NULL,
    "region" TEXT,
    "regionAbbreviation" TEXT,
    "metroArea" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMemberRole" (
    "id" SERIAL NOT NULL,
    "mainTeam" BOOLEAN NOT NULL,
    "teamLead" BOOLEAN NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "role" TEXT,
    "memberUid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,

    CONSTRAINT "TeamMemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryCategory" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryTag" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "definition" TEXT,
    "airtableRecId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "industryCategoryUid" TEXT,

    CONSTRAINT "IndustryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingStage" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipSource" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technology" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "version" "ImageSize" NOT NULL,
    "thumbnailToUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TeamToTechnology" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_MemberToSkill" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_IndustryTagToTeam" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_MembershipSourceToTeam" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_uid_key" ON "Team"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Member_uid_key" ON "Member"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_uid_key" ON "Skill"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_title_key" ON "Skill"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Location_uid_key" ON "Location"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Location_placeId_key" ON "Location"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_continent_country_region_city_metroArea_latitude_l_key" ON "Location"("continent", "country", "region", "city", "metroArea", "latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMemberRole_memberUid_teamUid_key" ON "TeamMemberRole"("memberUid", "teamUid");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryCategory_uid_key" ON "IndustryCategory"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryCategory_title_key" ON "IndustryCategory"("title");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryTag_uid_key" ON "IndustryTag"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryTag_title_key" ON "IndustryTag"("title");

-- CreateIndex
CREATE UNIQUE INDEX "FundingStage_uid_key" ON "FundingStage"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "FundingStage_title_key" ON "FundingStage"("title");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipSource_uid_key" ON "MembershipSource"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipSource_title_key" ON "MembershipSource"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Technology_uid_key" ON "Technology"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Technology_title_key" ON "Technology"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Image_uid_key" ON "Image"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "_TeamToTechnology_AB_unique" ON "_TeamToTechnology"("A", "B");

-- CreateIndex
CREATE INDEX "_TeamToTechnology_B_index" ON "_TeamToTechnology"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_MemberToSkill_AB_unique" ON "_MemberToSkill"("A", "B");

-- CreateIndex
CREATE INDEX "_MemberToSkill_B_index" ON "_MemberToSkill"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_IndustryTagToTeam_AB_unique" ON "_IndustryTagToTeam"("A", "B");

-- CreateIndex
CREATE INDEX "_IndustryTagToTeam_B_index" ON "_IndustryTagToTeam"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_MembershipSourceToTeam_AB_unique" ON "_MembershipSourceToTeam"("A", "B");

-- CreateIndex
CREATE INDEX "_MembershipSourceToTeam_B_index" ON "_MembershipSourceToTeam"("B");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_logoUid_fkey" FOREIGN KEY ("logoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_fundingStageUid_fkey" FOREIGN KEY ("fundingStageUid") REFERENCES "FundingStage"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_imageUid_fkey" FOREIGN KEY ("imageUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_locationUid_fkey" FOREIGN KEY ("locationUid") REFERENCES "Location"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMemberRole" ADD CONSTRAINT "TeamMemberRole_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMemberRole" ADD CONSTRAINT "TeamMemberRole_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustryTag" ADD CONSTRAINT "IndustryTag_industryCategoryUid_fkey" FOREIGN KEY ("industryCategoryUid") REFERENCES "IndustryCategory"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_thumbnailToUid_fkey" FOREIGN KEY ("thumbnailToUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TeamToTechnology" ADD CONSTRAINT "_TeamToTechnology_A_fkey" FOREIGN KEY ("A") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TeamToTechnology" ADD CONSTRAINT "_TeamToTechnology_B_fkey" FOREIGN KEY ("B") REFERENCES "Technology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemberToSkill" ADD CONSTRAINT "_MemberToSkill_A_fkey" FOREIGN KEY ("A") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemberToSkill" ADD CONSTRAINT "_MemberToSkill_B_fkey" FOREIGN KEY ("B") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IndustryTagToTeam" ADD CONSTRAINT "_IndustryTagToTeam_A_fkey" FOREIGN KEY ("A") REFERENCES "IndustryTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IndustryTagToTeam" ADD CONSTRAINT "_IndustryTagToTeam_B_fkey" FOREIGN KEY ("B") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MembershipSourceToTeam" ADD CONSTRAINT "_MembershipSourceToTeam_A_fkey" FOREIGN KEY ("A") REFERENCES "MembershipSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MembershipSourceToTeam" ADD CONSTRAINT "_MembershipSourceToTeam_B_fkey" FOREIGN KEY ("B") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
