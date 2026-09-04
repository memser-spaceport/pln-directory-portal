-- CreateTable
CREATE TABLE "JobOpeningInterest" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "jobOpeningUid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOpeningInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobOpeningInterest_uid_key" ON "JobOpeningInterest"("uid");

-- CreateIndex
CREATE INDEX "JobOpeningInterest_jobOpeningUid_idx" ON "JobOpeningInterest"("jobOpeningUid");

-- CreateIndex
CREATE INDEX "JobOpeningInterest_memberUid_idx" ON "JobOpeningInterest"("memberUid");

-- CreateIndex
CREATE UNIQUE INDEX "JobOpeningInterest_jobOpeningUid_memberUid_key" ON "JobOpeningInterest"("jobOpeningUid", "memberUid");

-- AddForeignKey
ALTER TABLE "JobOpeningInterest" ADD CONSTRAINT "JobOpeningInterest_jobOpeningUid_fkey" FOREIGN KEY ("jobOpeningUid") REFERENCES "JobOpening"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpeningInterest" ADD CONSTRAINT "JobOpeningInterest_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
