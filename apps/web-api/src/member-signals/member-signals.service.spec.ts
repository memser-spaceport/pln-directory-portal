import { MemberSignalsService } from './member-signals.service';

describe('MemberSignalsService.record (LAB-3121, LAB-3123)', () => {
  function build(
    overrides: { member?: unknown; existingView?: unknown; teamUids?: string[]; createError?: Error } = {}
  ) {
    const prisma = {
      member: {
        findUnique: jest.fn(async () =>
          'member' in overrides ? overrides.member : { signUpSource: null, email: 'a@protocol.ai' }
        ),
      },
      memberSignal: {
        findFirst: jest.fn(async () => overrides.existingView ?? null),
        create: jest.fn(async () => {
          if (overrides.createError) throw overrides.createError;
          return {};
        }),
      },
      teamMemberRole: {
        findMany: jest.fn(async () => (overrides.teamUids ?? []).map((teamUid) => ({ teamUid }))),
      },
      project: { findUnique: jest.fn(async () => ({ createdBy: 'someone', maintainingTeamUid: 'team-own' })) },
      teamNewsItem: { findUnique: jest.fn(async () => ({ teamUid: 'team-other', postedByMemberUid: 'm1' })) },
      jobOpening: { findUnique: jest.fn(async () => ({ teamUid: 'team-own' })) },
    };
    const analytics = { trackEvent: jest.fn(async () => undefined) };
    const service = new MemberSignalsService(prisma as never, analytics as never);
    return { service, prisma, analytics };
  }

  it('adds a row and sends member-signal-recorded', async () => {
    const { service, prisma, analytics } = build();

    await expect(
      service.record({ memberUid: 'm1', action: 'follow', entityType: 'TEAM', entityUid: 't1' })
    ).resolves.toBe(true);

    expect(prisma.memberSignal.create).toHaveBeenCalledWith({
      data: { memberUid: 'm1', action: 'follow', entityType: 'TEAM', entityUid: 't1', own: false },
    });
    expect(analytics.trackEvent).toHaveBeenCalledWith({
      name: 'member-signal-recorded',
      distinctId: 'm1',
      properties: { action: 'follow', entityType: 'TEAM', own: false },
    });
  });

  it.each([
    ['trending-seed bot', { signUpSource: 'system-trending-seed', email: 'b@x.io' }],
    ['test account', { signUpSource: null, email: 'qa@yopmail.com' }],
    ['unknown member', null],
  ])('adds nothing for a %s', async (_label, member) => {
    const { service, prisma, analytics } = build({ member });

    await expect(
      service.record({ memberUid: 'm1', action: 'news-upvote', entityType: 'NEWS_ITEM', entityUid: 'n1' })
    ).resolves.toBe(false);
    expect(prisma.memberSignal.create).not.toHaveBeenCalled();
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });

  it('marks a view of a team the member belongs to as own', async () => {
    const { service, prisma } = build({ teamUids: ['t1'] });

    await service.record({ memberUid: 'm1', action: 'view', entityType: 'TEAM', entityUid: 't1' });

    expect(prisma.memberSignal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ own: true }) });
  });

  it.each([
    ['MEMBER self', 'MEMBER', 'm1', [], true],
    ['MEMBER other', 'MEMBER', 'm2', [], false],
    ['PROJECT of own team', 'PROJECT', 'p1', ['team-own'], true],
    ['PROJECT of other team', 'PROJECT', 'p1', [], false],
    ['NEWS_ITEM posted by member', 'NEWS_ITEM', 'n1', [], true],
    ['JOB_OPENING of own team', 'JOB_OPENING', 'j1', ['team-own'], true],
  ] as const)('computes own for %s', async (_label, entityType, entityUid, teamUids, expected) => {
    const { service, prisma } = build({ teamUids: [...teamUids] });

    await service.record({ memberUid: 'm1', action: 'view', entityType, entityUid });

    expect(prisma.memberSignal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ own: expected }) });
  });

  it('adds one view per entity per UTC day', async () => {
    const { service, prisma, analytics } = build({ existingView: { id: 1 } });

    await expect(
      service.record({ memberUid: 'm1', action: 'view', entityType: 'TEAM', entityUid: 't1' })
    ).resolves.toBe(false);

    const where = (prisma.memberSignal.findFirst.mock.calls[0] as unknown[])[0] as {
      where: { createdAt: { gte: Date } };
    };
    expect(where.where.createdAt.gte.getUTCHours()).toBe(0);
    expect(where.where.createdAt.gte.getUTCMinutes()).toBe(0);
    expect(prisma.memberSignal.create).not.toHaveBeenCalled();
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });

  it('never deduplicates clicks or copies', async () => {
    const { service, prisma } = build({ existingView: { id: 1 } });

    await service.record({ memberUid: 'm1', action: 'contact-copy', entityType: 'MEMBER', entityUid: 'm2' });

    expect(prisma.memberSignal.findFirst).not.toHaveBeenCalled();
    expect(prisma.memberSignal.create).toHaveBeenCalled();
  });

  it('logs and resolves false when the write fails', async () => {
    const { service, analytics } = build({ createError: new Error('db down') });
    const logSpy = jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error');
    logSpy.mockImplementation(() => undefined);

    await expect(
      service.record({ memberUid: 'm1', action: 'follow', entityType: 'TEAM', entityUid: 't1' })
    ).resolves.toBe(false);
    expect(logSpy).toHaveBeenCalled();
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });

  it('ignores an unknown action', async () => {
    const { service, prisma } = build();

    await expect(
      service.record({ memberUid: 'm1', action: 'nope' as never, entityType: 'TEAM', entityUid: 't1' })
    ).resolves.toBe(false);
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
  });
});
