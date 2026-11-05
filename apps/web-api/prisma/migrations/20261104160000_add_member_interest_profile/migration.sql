-- CreateTable
CREATE TABLE "MemberInterestProfileEntry" (
    "id" SERIAL NOT NULL,
    "memberUid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberInterestProfileEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberInterestProfileRun" (
    "id" SERIAL NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "membersCount" INTEGER,
    "nonEmptyCount" INTEGER,
    "error" TEXT,

    CONSTRAINT "MemberInterestProfileRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberInterestProfileEntry_kind_key_idx" ON "MemberInterestProfileEntry"("kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "MemberInterestProfileEntry_memberUid_kind_key_key" ON "MemberInterestProfileEntry"("memberUid", "kind", "key");

-- CreateIndex
CREATE INDEX "MemberInterestProfileRun_status_startedAt_idx" ON "MemberInterestProfileRun"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "MemberInterestProfileEntry" ADD CONSTRAINT "MemberInterestProfileEntry_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

