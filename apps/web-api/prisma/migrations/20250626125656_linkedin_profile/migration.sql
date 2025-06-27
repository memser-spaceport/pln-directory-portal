-- CreateTable
CREATE TABLE "LinkedInProfile" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "linkedinProfileId" TEXT NOT NULL,
    "linkedinHandler" TEXT,
    "profileData" JSONB NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInProfile_uid_key" ON "LinkedInProfile"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInProfile_memberUid_key" ON "LinkedInProfile"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInProfile_linkedinProfileId_key" ON "LinkedInProfile"("linkedinProfileId");

-- AddForeignKey
ALTER TABLE "LinkedInProfile" ADD CONSTRAINT "LinkedInProfile_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
