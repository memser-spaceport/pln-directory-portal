import { MemberSignalOwnershipResolver } from './member-signal-ownership';

describe('MemberSignalOwnershipResolver, EVENT (LAB-3267)', () => {
  function build(links: { memberUid: string | null; teamUid: string | null }[], teamUids: string[] = []) {
    const prisma = {
      teamMemberRole: { findMany: jest.fn(async () => teamUids.map((teamUid) => ({ teamUid }))) },
      pLEventAssociation: { findMany: jest.fn(async () => links) },
    };
    return { resolver: new MemberSignalOwnershipResolver(prisma as never), prisma };
  }

  it('reads only host, co-host, speaker and sponsor links, so an attendee-only team is not own', async () => {
    // The role filter is in the query: an attendee link never comes back.
    const { resolver, prisma } = build([], ['t1']);

    await expect(resolver.isOwn('m1', 'EVENT', 'e1')).resolves.toBe(false);
    expect(prisma.pLEventAssociation.findMany).toHaveBeenCalledWith({
      where: { eventUid: 'e1', role: { in: ['HOST', 'CO_HOST', 'SPEAKER', 'SPONSOR'] } },
      select: { memberUid: true, teamUid: true },
    });
  });

  it('is own when a team of the member is linked', async () => {
    const { resolver } = build([{ memberUid: null, teamUid: 't1' }], ['t1']);

    await expect(resolver.isOwn('m1', 'EVENT', 'e1')).resolves.toBe(true);
  });

  it('is own when the member is linked directly', async () => {
    const { resolver } = build([{ memberUid: 'm1', teamUid: null }]);

    await expect(resolver.isOwn('m1', 'EVENT', 'e1')).resolves.toBe(true);
  });

  it('is not own for an event linked to other teams and members', async () => {
    const { resolver } = build(
      [
        { memberUid: 'm2', teamUid: null },
        { memberUid: null, teamUid: 't9' },
      ],
      ['t1']
    );

    await expect(resolver.isOwn('m1', 'EVENT', 'e1')).resolves.toBe(false);
  });

  it('is not own for an unknown event', async () => {
    const { resolver } = build([], ['t1']);

    await expect(resolver.isOwn('m1', 'EVENT', 'ghost')).resolves.toBe(false);
  });
});
