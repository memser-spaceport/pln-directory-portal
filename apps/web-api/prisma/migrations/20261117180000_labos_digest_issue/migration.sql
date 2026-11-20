-- LAB-3294: each member's sent digest issue, for Past issues on the digest page.
CREATE TABLE "LabosDigestIssue" (
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "frequency" "LabosDigestFrequency" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "newsItemUids" TEXT[],
    "leadUid" TEXT,
    "forumTids" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabosDigestIssue_pkey" PRIMARY KEY ("uid")
);

CREATE UNIQUE INDEX "LabosDigestIssue_memberUid_frequency_sentAt_key" ON "LabosDigestIssue"("memberUid", "frequency", "sentAt");

CREATE INDEX "LabosDigestIssue_memberUid_sentAt_idx" ON "LabosDigestIssue"("memberUid", "sentAt");

ALTER TABLE "LabosDigestIssue" ADD CONSTRAINT "LabosDigestIssue_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
