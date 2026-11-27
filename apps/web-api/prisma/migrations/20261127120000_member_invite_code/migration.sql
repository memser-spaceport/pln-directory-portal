-- LAB-3396: one reusable, public invite code per member. Additive only.
CREATE TABLE "MemberInviteCode" (
    "id" SERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "memberUid" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberInviteCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberInviteCode_uid_key" ON "MemberInviteCode"("uid");
CREATE UNIQUE INDEX "MemberInviteCode_memberUid_key" ON "MemberInviteCode"("memberUid");
CREATE UNIQUE INDEX "MemberInviteCode_code_key" ON "MemberInviteCode"("code");

ALTER TABLE "MemberInviteCode" ADD CONSTRAINT "MemberInviteCode_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
