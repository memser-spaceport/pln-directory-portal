CREATE TYPE "SpvInvestorCohort" AS ENUM ('PRE_APPROVED', 'OUTREACH');
CREATE TYPE "SpvAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "SpvSpotlight" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "teamUid" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TeamPitchStatus" NOT NULL DEFAULT 'DRAFT',
    "supportEmail" TEXT NOT NULL,
    "senderEmail" TEXT,
    "senderName" TEXT,
    "replyToEmail" TEXT,
    "docSendUrl" TEXT,
    "summary" TEXT,
    "emailTemplates" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpvSpotlight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpvSpotlight_uid_key" ON "SpvSpotlight"("uid");
CREATE UNIQUE INDEX "SpvSpotlight_teamUid_key" ON "SpvSpotlight"("teamUid");
CREATE UNIQUE INDEX "SpvSpotlight_slug_key" ON "SpvSpotlight"("slug");
CREATE INDEX "SpvSpotlight_status_idx" ON "SpvSpotlight"("status");

ALTER TABLE "SpvSpotlight" ADD CONSTRAINT "SpvSpotlight_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SpvSpotlightMedia" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "spvSpotlightUid" TEXT NOT NULL,
    "imageUid" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "fit" TEXT NOT NULL DEFAULT 'cover',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpvSpotlightMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpvSpotlightMedia_uid_key" ON "SpvSpotlightMedia"("uid");
CREATE INDEX "SpvSpotlightMedia_spvSpotlightUid_sortOrder_idx" ON "SpvSpotlightMedia"("spvSpotlightUid", "sortOrder");

ALTER TABLE "SpvSpotlightMedia" ADD CONSTRAINT "SpvSpotlightMedia_spvSpotlightUid_fkey" FOREIGN KEY ("spvSpotlightUid") REFERENCES "SpvSpotlight"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpvSpotlightMedia" ADD CONSTRAINT "SpvSpotlightMedia_imageUid_fkey" FOREIGN KEY ("imageUid") REFERENCES "Image"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SpvSpotlightParticipant" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "spvSpotlightUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "type" "TeamPitchParticipantType" NOT NULL,
    "access" "TeamPitchParticipantAccess" NOT NULL,
    "cohort" "SpvInvestorCohort",
    "teamUid" TEXT,
    "inviteSentAt" TIMESTAMP(3),
    "inviteSentCount" INTEGER NOT NULL DEFAULT 0,
    "followUpSentAt" TIMESTAMP(3),
    "followUpSentCount" INTEGER NOT NULL DEFAULT 0,
    "openNoticeSentAt" TIMESTAMP(3),
    "openNoticeSentCount" INTEGER NOT NULL DEFAULT 0,
    "emailTemplateVariables" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpvSpotlightParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpvSpotlightParticipant_uid_key" ON "SpvSpotlightParticipant"("uid");
CREATE UNIQUE INDEX "SpvSpotlightParticipant_spvSpotlightUid_memberUid_key" ON "SpvSpotlightParticipant"("spvSpotlightUid", "memberUid");
CREATE INDEX "SpvSpotlightParticipant_spvSpotlightUid_type_idx" ON "SpvSpotlightParticipant"("spvSpotlightUid", "type");

ALTER TABLE "SpvSpotlightParticipant" ADD CONSTRAINT "SpvSpotlightParticipant_spvSpotlightUid_fkey" FOREIGN KEY ("spvSpotlightUid") REFERENCES "SpvSpotlight"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpvSpotlightParticipant" ADD CONSTRAINT "SpvSpotlightParticipant_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpvSpotlightParticipant" ADD CONSTRAINT "SpvSpotlightParticipant_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SpvAccessRequest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "spvSpotlightUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "status" "SpvAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "role" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "teamUid" TEXT,
    "isAccreditedInvestor" BOOLEAN NOT NULL DEFAULT false,
    "openNoticeSentAt" TIMESTAMP(3),
    "openNoticeSentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpvAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpvAccessRequest_uid_key" ON "SpvAccessRequest"("uid");
CREATE UNIQUE INDEX "SpvAccessRequest_spvSpotlightUid_memberUid_key" ON "SpvAccessRequest"("spvSpotlightUid", "memberUid");
CREATE INDEX "SpvAccessRequest_spvSpotlightUid_status_idx" ON "SpvAccessRequest"("spvSpotlightUid", "status");

ALTER TABLE "SpvAccessRequest" ADD CONSTRAINT "SpvAccessRequest_spvSpotlightUid_fkey" FOREIGN KEY ("spvSpotlightUid") REFERENCES "SpvSpotlight"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpvAccessRequest" ADD CONSTRAINT "SpvAccessRequest_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpvAccessRequest" ADD CONSTRAINT "SpvAccessRequest_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Team" ADD COLUMN "portfolioIsland" TEXT;
ALTER TABLE "Team" ADD COLUMN "portfolioStartYear" INTEGER;
ALTER TABLE "Team" ADD COLUMN "portfolioEndYear" INTEGER;
