import { MembersService } from './members.service';

/** LAB-3290: the service lookup tells the digest email whether each member is on a team now. */
describe('MembersService.findMembersByIds isTeamMember', () => {
  const build = (rows: unknown[]) => {
    const findMany = jest.fn(async () => rows);
    const service = Object.create(MembersService.prototype) as MembersService;
    Object.assign(service, { prisma: { member: { findMany } } });
    return { service, findMany };
  };
  const row = (uid: string, roles: unknown[]) => ({
    uid,
    name: uid,
    email: `${uid}@example.com`,
    roleAssignments: [],
    policyAssignmentsV2: [],
    memberPermissionsV2: [],
    teamMemberRoles: roles,
  });

  it('is true with an active team role and false without one', async () => {
    const { service } = build([row('a', [{ teamUid: 't1' }]), row('b', [])]);
    const members = await service.findMembersByIds(['a', 'b']);
    expect(members.map((m) => [m.uid, m.isTeamMember])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('asks only for roles without an end date or ending today or later', async () => {
    const { service, findMany } = build([]);
    await service.findMembersByIds(['a']);
    const roles = (findMany.mock.calls[0] as any)[0].include.teamMemberRoles;
    expect(roles.where.OR[0]).toEqual({ endDate: null });
    expect(roles.where.OR[1].endDate.gte).toBeInstanceOf(Date);
    expect(roles.take).toBe(1);
  });
});
