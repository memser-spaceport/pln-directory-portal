-- CreateTable
CREATE TABLE "Experience" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "logoUid" TEXT,
    "title" TEXT NOT NULL,
    "currentTeam" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "memberUid" TEXT NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Experience_uid_key" ON "Experience"("uid");

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_logoUid_fkey" FOREIGN KEY ("logoUid") REFERENCES "Image"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;
