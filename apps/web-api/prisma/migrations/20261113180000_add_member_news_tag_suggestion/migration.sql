-- CreateTable
CREATE TABLE "MemberNewsTagSuggestion" (
    "id" SERIAL NOT NULL,
    "memberUid" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inputHash" TEXT,
    "model" TEXT,
    "generatedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberNewsTagSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberNewsTagSuggestion_memberUid_key" ON "MemberNewsTagSuggestion"("memberUid");

-- CreateIndex
CREATE INDEX "MemberNewsTagSuggestion_lastAttemptAt_idx" ON "MemberNewsTagSuggestion"("lastAttemptAt");

-- AddForeignKey
ALTER TABLE "MemberNewsTagSuggestion" ADD CONSTRAINT "MemberNewsTagSuggestion_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
