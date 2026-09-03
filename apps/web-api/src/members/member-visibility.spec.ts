import { MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { directoryListedMemberWhere, directoryVisibleMemberWhere } from './member-visibility';

describe('directoryListedMemberWhere', () => {
  it('includes only APPROVED members', () => {
    expect(directoryListedMemberWhere()).toEqual({ memberApproval: { state: { in: ['APPROVED'] } } });
  });

  it('does not include members via member.profile.visible', () => {
    expect(JSON.stringify(directoryListedMemberWhere())).not.toContain(MEMBER_PERMISSIONS.PROFILE_VISIBLE);
  });
});

describe('directoryVisibleMemberWhere', () => {
  const where = directoryVisibleMemberWhere();
  const branches = Array.isArray(where.OR) ? where.OR : [];
  const approvedBranch = branches[0];
  const permissionBranch = branches[1];

  it('includes APPROVED members regardless of permission', () => {
    expect(approvedBranch).toEqual({ memberApproval: { state: { in: ['APPROVED'] } } });
  });

  it('includes PENDING members who hold member.profile.visible', () => {
    expect(JSON.stringify(permissionBranch)).toContain(MEMBER_PERMISSIONS.PROFILE_VISIBLE);
    expect(permissionBranch).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          {
            OR: expect.arrayContaining([
              expect.objectContaining({ policyAssignmentsV2: expect.any(Object) }),
              expect.objectContaining({ memberPermissionsV2: expect.any(Object) }),
            ]),
          },
        ]),
      })
    );
  });

  it('excludes REJECTED members even if they hold the permission', () => {
    expect(permissionBranch).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([{ NOT: { memberApproval: { state: 'REJECTED' } } }]),
      })
    );
  });
});
