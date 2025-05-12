-- CreateTable
CREATE TABLE "MemberExperience" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "startDate" JSONB NOT NULL,
    "endDate" JSONB NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "experience" JSONB,
    "isFlaggedByUser" BOOLEAN NOT NULL DEFAULT false,
    "isModifiedByUser" BOOLEAN NOT NULL DEFAULT false,
    "userUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "memberUid" TEXT NOT NULL,

    CONSTRAINT "MemberExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberlinkedInDetails" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "data" JSONB,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberlinkedInDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberExperience_uid_key" ON "MemberExperience"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberlinkedInDetails_uid_key" ON "MemberlinkedInDetails"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberlinkedInDetails_memberUid_key" ON "MemberlinkedInDetails"("memberUid");

-- AddForeignKey
ALTER TABLE "MemberExperience" ADD CONSTRAINT "MemberExperience_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberlinkedInDetails" ADD CONSTRAINT "MemberlinkedInDetails_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
