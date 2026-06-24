-- CreateEnum
CREATE TYPE "AffinityIngestRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AffinityEntityLinkMethod" AS ENUM ('AIRTABLE_REC_ID', 'DOMAIN', 'EMAIL', 'AFFINITY_ID', 'DIRECTORY_UID', 'MANUAL');

-- CreateTable
CREATE TABLE "AffinityIngestRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "AffinityIngestRunStatus" NOT NULL DEFAULT 'RUNNING',
    "scope" VARCHAR(32) NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "AffinityIngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffinityCompany" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "affinityOrgId" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "domain" VARCHAR(255),
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "buildersFunnelRecordId" VARCHAR(128),
    "dealStatus" VARCHAR(120),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenStatus" VARCHAR(80),
    "postMoneyValuation" DECIMAL(20,2),
    "exitDate" TIMESTAMP(3),
    "deckLink" TEXT,
    "acceleratorProgram" VARCHAR(120),
    "investorType" VARCHAR(80),
    "relationshipRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fundRelevance" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "investmentStage" VARCHAR(120),
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "yearFounded" INTEGER,
    "totalFundingUsd" DECIMAL(20,2),
    "lastFundingUsd" DECIMAL(20,2),
    "lastFundingDate" TIMESTAMP(3),
    "linkedinUrl" TEXT,
    "employeeCount" INTEGER,
    "linkedinHeadcount" INTEGER,
    "location" JSONB,
    "priority" VARCHAR(80),
    "kpiListStatus" VARCHAR(80),
    "mrr" DECIMAL(20,2),
    "revenueLtm" DECIMAL(20,2),
    "monthlyBurn" DECIMAL(20,2),
    "cashBalance" DECIMAL(20,2),
    "runwayMonths" INTEGER,
    "teamFte" INTEGER,
    "totalUsers" INTEGER,
    "maus" INTEGER,
    "daus" INTEGER,
    "initialInvestmentUsd" DECIMAL(20,2),
    "valuationAtInvestmentUsd" DECIMAL(20,2),
    "latestPostMoneyUsd" DECIMAL(20,2),
    "fundedVia" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kpiLastUpdateAt" TIMESTAMP(3),
    "planToFundraise6Mo" VARCHAR(80),
    "lastContactAt" TIMESTAMP(3),
    "lastEmailAt" TIMESTAMP(3),
    "firstEmailAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "firstEventAt" TIMESTAMP(3),
    "nextEventAt" TIMESTAMP(3),
    "sourceOfIntroduction" JSONB,
    "linkedPersonIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "teamUid" TEXT,
    "linkMethod" "AffinityEntityLinkMethod",
    "linkConfidence" DOUBLE PRECISION,
    "linkedAt" TIMESTAMP(3),
    "rawFields" JSONB NOT NULL,
    "rawV1Organization" JSONB,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIngestRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffinityCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffinityPerson" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "affinityPersonId" VARCHAR(64) NOT NULL,
    "firstName" VARCHAR(120),
    "lastName" VARCHAR(120),
    "fullName" VARCHAR(240),
    "primaryEmail" VARCHAR(320),
    "emailAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "buildersFunnelRecordId" VARCHAR(128),
    "telegram" VARCHAR(120),
    "linkedinUrl" TEXT,
    "phoneNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentJobTitle" VARCHAR(240),
    "currentOrganizationName" VARCHAR(240),
    "currentOrganizationAffinityId" VARCHAR(64),
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" JSONB,
    "relationshipTiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relationshipRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fundRelevance" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investorTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stagePreference" TEXT,
    "sectorFocus" TEXT,
    "dataSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dataQuality" TEXT,
    "engagementScore" DOUBLE PRECISION,
    "relationshipScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "keyContact" VARCHAR(240),
    "standing" VARCHAR(80),
    "listStatus" VARCHAR(80),
    "gender" VARCHAR(40),
    "lastContactAt" TIMESTAMP(3),
    "lastEmailAt" TIMESTAMP(3),
    "firstEmailAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "firstEventAt" TIMESTAMP(3),
    "nextEventAt" TIMESTAMP(3),
    "sourceOfIntroduction" JSONB,
    "memberUid" TEXT,
    "linkMethod" "AffinityEntityLinkMethod",
    "linkConfidence" DOUBLE PRECISION,
    "linkedAt" TIMESTAMP(3),
    "primaryCompanyUid" TEXT,
    "rawFields" JSONB NOT NULL,
    "rawV1Person" JSONB,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIngestRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffinityPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffinityPersonOrganization" (
    "id" SERIAL NOT NULL,
    "personUid" TEXT NOT NULL,
    "companyUid" TEXT NOT NULL,
    "affinityOrgId" VARCHAR(64) NOT NULL,
    "affinityPersonId" VARCHAR(64) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "jobTitle" VARCHAR(240),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffinityPersonOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffinityListMembership" (
    "id" SERIAL NOT NULL,
    "affinityListId" INTEGER NOT NULL,
    "affinityListEntryId" INTEGER NOT NULL,
    "listName" VARCHAR(200) NOT NULL,
    "companyUid" TEXT,
    "personUid" TEXT,
    "listFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffinityListMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffinityCompany_uid_key" ON "AffinityCompany"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "AffinityCompany_affinityOrgId_key" ON "AffinityCompany"("affinityOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "AffinityCompany_teamUid_key" ON "AffinityCompany"("teamUid");

-- CreateIndex
CREATE INDEX "AffinityCompany_domain_idx" ON "AffinityCompany"("domain");

-- CreateIndex
CREATE INDEX "AffinityCompany_buildersFunnelRecordId_idx" ON "AffinityCompany"("buildersFunnelRecordId");

-- CreateIndex
CREATE INDEX "AffinityCompany_dealStatus_idx" ON "AffinityCompany"("dealStatus");

-- CreateIndex
CREATE INDEX "AffinityCompany_priority_idx" ON "AffinityCompany"("priority");

-- CreateIndex
CREATE INDEX "AffinityCompany_teamUid_idx" ON "AffinityCompany"("teamUid");

-- CreateIndex
CREATE INDEX "AffinityCompany_lastIngestRunId_idx" ON "AffinityCompany"("lastIngestRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AffinityPerson_uid_key" ON "AffinityPerson"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "AffinityPerson_affinityPersonId_key" ON "AffinityPerson"("affinityPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "AffinityPerson_memberUid_key" ON "AffinityPerson"("memberUid");

-- CreateIndex
CREATE INDEX "AffinityPerson_primaryEmail_idx" ON "AffinityPerson"("primaryEmail");

-- CreateIndex
CREATE INDEX "AffinityPerson_buildersFunnelRecordId_idx" ON "AffinityPerson"("buildersFunnelRecordId");

-- CreateIndex
CREATE INDEX "AffinityPerson_currentOrganizationAffinityId_idx" ON "AffinityPerson"("currentOrganizationAffinityId");

-- CreateIndex
CREATE INDEX "AffinityPerson_memberUid_idx" ON "AffinityPerson"("memberUid");

-- CreateIndex
CREATE INDEX "AffinityPerson_primaryCompanyUid_idx" ON "AffinityPerson"("primaryCompanyUid");

-- CreateIndex
CREATE INDEX "AffinityPerson_lastIngestRunId_idx" ON "AffinityPerson"("lastIngestRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AffinityPersonOrganization_personUid_companyUid_key" ON "AffinityPersonOrganization"("personUid", "companyUid");

-- CreateIndex
CREATE INDEX "AffinityPersonOrganization_affinityOrgId_idx" ON "AffinityPersonOrganization"("affinityOrgId");

-- CreateIndex
CREATE INDEX "AffinityPersonOrganization_affinityPersonId_idx" ON "AffinityPersonOrganization"("affinityPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "AffinityListMembership_affinityListEntryId_key" ON "AffinityListMembership"("affinityListEntryId");

-- CreateIndex
CREATE INDEX "AffinityListMembership_affinityListId_idx" ON "AffinityListMembership"("affinityListId");

-- CreateIndex
CREATE INDEX "AffinityListMembership_companyUid_idx" ON "AffinityListMembership"("companyUid");

-- CreateIndex
CREATE INDEX "AffinityListMembership_personUid_idx" ON "AffinityListMembership"("personUid");

-- CreateIndex
CREATE INDEX "AffinityIngestRun_startedAt_idx" ON "AffinityIngestRun"("startedAt");

-- CreateIndex
CREATE INDEX "AffinityIngestRun_status_idx" ON "AffinityIngestRun"("status");

-- AddForeignKey
ALTER TABLE "AffinityCompany" ADD CONSTRAINT "AffinityCompany_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffinityCompany" ADD CONSTRAINT "AffinityCompany_lastIngestRunId_fkey" FOREIGN KEY ("lastIngestRunId") REFERENCES "AffinityIngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffinityPerson" ADD CONSTRAINT "AffinityPerson_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffinityPerson" ADD CONSTRAINT "AffinityPerson_primaryCompanyUid_fkey" FOREIGN KEY ("primaryCompanyUid") REFERENCES "AffinityCompany"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffinityPerson" ADD CONSTRAINT "AffinityPerson_lastIngestRunId_fkey" FOREIGN KEY ("lastIngestRunId") REFERENCES "AffinityIngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffinityPersonOrganization" ADD CONSTRAINT "AffinityPersonOrganization_personUid_fkey" FOREIGN KEY ("personUid") REFERENCES "AffinityPerson"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffinityPersonOrganization" ADD CONSTRAINT "AffinityPersonOrganization_companyUid_fkey" FOREIGN KEY ("companyUid") REFERENCES "AffinityCompany"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey 
ALTER TABLE "AffinityListMembership" ADD CONSTRAINT "AffinityListMembership_companyUid_fkey" FOREIGN KEY ("companyUid") REFERENCES "AffinityCompany"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffinityListMembership" ADD CONSTRAINT "AffinityListMembership_personUid_fkey" FOREIGN KEY ("personUid") REFERENCES "AffinityPerson"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
