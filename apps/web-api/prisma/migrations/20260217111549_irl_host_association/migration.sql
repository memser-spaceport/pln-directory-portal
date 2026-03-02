-- CreateEnum
CREATE TYPE "AssociationRole" AS ENUM ('HOST', 'CO_HOST', 'SPEAKER', 'SPONSOR', 'ATTENDEE');

-- CreateEnum
CREATE TYPE "AssociationEntityType" AS ENUM ('MEMBER', 'TEAM');

-- CreateTable
CREATE TABLE "PLEventAssociation" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "eventUid" TEXT NOT NULL,
    "entityType" "AssociationEntityType" NOT NULL,
    "memberUid" TEXT,
    "teamUid" TEXT,
    "role" "AssociationRole" NOT NULL,
    "externalEventId" TEXT,
    "externalAssociationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PLEventAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PLEventAssociation_uid_key" ON "PLEventAssociation"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "PLEventAssociation_externalEventId_externalAssociationId_key" ON "PLEventAssociation"("externalEventId", "externalAssociationId");

-- AddForeignKey
ALTER TABLE "PLEventAssociation" ADD CONSTRAINT "PLEventAssociation_eventUid_fkey" FOREIGN KEY ("eventUid") REFERENCES "PLEvent"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLEventAssociation" ADD CONSTRAINT "PLEventAssociation_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLEventAssociation" ADD CONSTRAINT "PLEventAssociation_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
