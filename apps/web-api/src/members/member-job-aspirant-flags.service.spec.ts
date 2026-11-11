jest.mock('./members.service', () => ({ MembersService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));

import { JOB_ASPIRANT_POLICY_CODE } from '../access-control-v2/access-control-v2.constants';
import { MemberJobAspirantFlagsService } from './member-job-aspirant-flags.service';

describe('MemberJobAspirantFlagsService.flagForViewer', () => {
  const members = [{ uid: 'aspirant' }, { uid: 'regular' }];

  function setup(viewer: { isDirectoryAdmin: boolean } | null) {
    const prisma = {
      policyAssignment: { findMany: jest.fn().mockResolvedValue([{ memberUid: 'aspirant' }]) },
    };
    const membersService = { findMemberByEmail: jest.fn().mockResolvedValue(viewer) };
    const service = new MemberJobAspirantFlagsService(prisma as any, membersService as any);
    return { service, prisma, membersService };
  }

  it('flags job aspirants for a directory admin', async () => {
    const { service, prisma } = setup({ isDirectoryAdmin: true });

    const result = await service.flagForViewer(members, 'admin@example.com');

    expect(result).toEqual([
      { uid: 'aspirant', isJobAspirant: true },
      { uid: 'regular', isJobAspirant: false },
    ]);
    expect(prisma.policyAssignment.findMany).toHaveBeenCalledWith({
      where: { memberUid: { in: ['aspirant', 'regular'] }, policy: { code: JOB_ASPIRANT_POLICY_CODE } },
      select: { memberUid: true },
    });
  });

  it('leaves the list unchanged for a viewer who is not an admin', async () => {
    const { service, prisma } = setup({ isDirectoryAdmin: false });

    const result = await service.flagForViewer(members, 'member@example.com');

    expect(result).toBe(members);
    expect(prisma.policyAssignment.findMany).not.toHaveBeenCalled();
  });

  it('leaves the list unchanged for a logged-out viewer without looking anyone up', async () => {
    const { service, membersService } = setup(null);

    const result = await service.flagForViewer(members, undefined);

    expect(result).toBe(members);
    expect(membersService.findMemberByEmail).not.toHaveBeenCalled();
  });

  it('leaves the list unchanged for an unknown viewer email', async () => {
    const { service } = setup(null);

    expect(await service.flagForViewer(members, 'ghost@example.com')).toBe(members);
  });
});
