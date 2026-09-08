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

/**
 * Members whose public profile is reachable. Approved, or holding
 * `member.profile.visible` and not REJECTED.
 *
 * This rule is also hand-written in SQL as `DIRECTORY_VISIBLE_MEMBER_SQL` in
 * `lambda/lambda-opensearch-sync/index.mjs`, which decides who reaches the
 * OpenSearch `member` index behind global search. The two must agree — change
 * one, change the other. (Unifying them behind a Postgres view is the eventual
 * fix; until then this comment is the only thing linking them.)
 */
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
