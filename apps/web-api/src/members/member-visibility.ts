import { Prisma } from '@prisma/client';
import { MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

const hasProfileVisiblePermission: Prisma.MemberWhereInput = {
  OR: [
    {
      policyAssignmentsV2: {
        some: {
          policy: {
            policyPermissions: {
              some: { permission: { code: MEMBER_PERMISSIONS.PROFILE_VISIBLE } },
            },
          },
        },
      },
    },
    {
      memberPermissionsV2: {
        some: { permission: { code: MEMBER_PERMISSIONS.PROFILE_VISIBLE } },
      },
    },
  ],
};

/** Members that appear on directory list/search. Approved only. */
export function directoryListedMemberWhere(): Prisma.MemberWhereInput {
  return { memberApproval: { state: { in: ['APPROVED'] } } };
}

/** Members whose public profile is reachable. Approved, or holding `member.profile.visible` and not REJECTED. */
export function directoryVisibleMemberWhere(): Prisma.MemberWhereInput {
  return {
    OR: [
      directoryListedMemberWhere(),
      {
        AND: [{ NOT: { memberApproval: { state: 'REJECTED' } } }, hasProfileVisiblePermission],
      },
    ],
  };
}
