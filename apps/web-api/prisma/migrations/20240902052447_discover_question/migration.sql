-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "bio" TEXT;

-- CreateTable
CREATE TABLE "DiscoveryQuestion" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "viewCount" INTEGER,
    "shareCount" INTEGER,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "teamUid" TEXT,
    "projectUid" TEXT,
    "eventUid" TEXT,
    "createdBy" TEXT NOT NULL,
    "modifiedBy" TEXT NOT NULL,
    "answer" TEXT,
    "answerSources" JSONB[],
    "answerSourceFrom" TEXT,
    "relatedQuestions" JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryQuestion_uid_key" ON "DiscoveryQuestion"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryQuestion_slug_key" ON "DiscoveryQuestion"("slug");

-- AddForeignKey
ALTER TABLE "DiscoveryQuestion" ADD CONSTRAINT "DiscoveryQuestion_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryQuestion" ADD CONSTRAINT "DiscoveryQuestion_projectUid_fkey" FOREIGN KEY ("projectUid") REFERENCES "Project"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryQuestion" ADD CONSTRAINT "DiscoveryQuestion_eventUid_fkey" FOREIGN KEY ("eventUid") REFERENCES "PLEvent"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryQuestion" ADD CONSTRAINT "DiscoveryQuestion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryQuestion" ADD CONSTRAINT "DiscoveryQuestion_modifiedBy_fkey" FOREIGN KEY ("modifiedBy") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
