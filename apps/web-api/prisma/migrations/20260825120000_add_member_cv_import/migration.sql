-- CreateEnum
CREATE TYPE "MemberCvImportStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'NOTHING_FOUND', 'FAILED');

-- CreateTable
CREATE TABLE "MemberCvImport" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "status" "MemberCvImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "originalFilename" TEXT NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "payload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberCvImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberCvImport_uid_key" ON "MemberCvImport"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCvImport_memberUid_key" ON "MemberCvImport"("memberUid");

-- AddForeignKey
ALTER TABLE "MemberCvImport" ADD CONSTRAINT "MemberCvImport_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
