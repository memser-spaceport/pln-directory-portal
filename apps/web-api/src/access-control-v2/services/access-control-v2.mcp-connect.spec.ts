jest.mock('../../shared/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('../../member-approvals/member-approvals.service', () => ({ MemberApprovalsService: jest.fn() }));

import { AccessControlV2Service } from './access-control-v2.service';

function permission(code: string) {
  return { uid: code, code, description: code, module: 'Directory' };
}

function build(state: string | null) {
  const prisma = {
    member: { findUnique: jest.fn(async () => ({ uid: 'm1' })) },
    policyAssignment: {
      findMany: jest.fn(async () => [
        {
          uid: 'a1',
          policy: {
            code: 'founder_plc_plvs',
            name: 'Founder',
            role: 'Member',
            group: 'PL',
            policyPermissions: [{ permission: permission('mcp.connect') }, { permission: permission('forum.read') }],
          },
        },
      ]),
    },
    memberPermissionV2: { findMany: jest.fn(async () => []) },
    memberApproval: { findUnique: jest.fn(async () => (state === null ? null : { state })) },
  };
  const service = new AccessControlV2Service(prisma as never, {} as never, {} as never);
  return service;
}

describe('mcp.connect follows approval state', () => {
  it('keeps mcp.connect for an approved member', async () => {
    const access = await build('APPROVED').getMemberAccess('m1');
    expect(access.effectivePermissions).toEqual(expect.arrayContaining(['mcp.connect', 'forum.read']));
  });

  it.each(['PENDING', 'VERIFIED', 'REJECTED', null])('hides mcp.connect when approval is %s', async (state) => {
    const access = await build(state).getMemberAccess('m1');
    expect(access.effectivePermissions).not.toContain('mcp.connect');
    expect(access.effectivePermissions).toContain('forum.read');
    expect(access.policies[0].permissions).not.toContain('mcp.connect');
  });
});
