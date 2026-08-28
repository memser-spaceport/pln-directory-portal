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

/** Approved members, plus anyone with `member.profile.visible` who is not REJECTED. */
export function directoryVisibleMemberWhere(): Prisma.MemberWhereInput {
  return {
    OR: [
      { memberApproval: { state: { in: ['APPROVED'] } } },
      {
        AND: [{ NOT: { memberApproval: { state: 'REJECTED' } } }, hasProfileVisiblePermission],
      },
    ],
  };
}
