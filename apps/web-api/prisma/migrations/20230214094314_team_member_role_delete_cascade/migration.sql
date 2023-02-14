-- DropForeignKey
ALTER TABLE "TeamMemberRole" DROP CONSTRAINT "TeamMemberRole_memberUid_fkey";

-- DropForeignKey
ALTER TABLE "TeamMemberRole" DROP CONSTRAINT "TeamMemberRole_teamUid_fkey";

-- AddForeignKey
ALTER TABLE "TeamMemberRole" ADD CONSTRAINT "TeamMemberRole_memberUid_fkey" FOREIGN KEY ("memberUid") REFERENCES "Member"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMemberRole" ADD CONSTRAINT "TeamMemberRole_teamUid_fkey" FOREIGN KEY ("teamUid") REFERENCES "Team"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
