// `ai` pulls in untranspiled ESM this jest config can't parse; `tool()` just needs to hand
// back its config object so `getTool()` yields something with a callable `execute`.
jest.mock('ai', () => ({ tool: (config: any) => config }));
// p-limit ships ESM only; the limiter's scheduling is irrelevant here.
jest.mock('p-limit', () => ({ __esModule: true, default: () => (fn: () => unknown) => fn() }));
// pl-event-guests.service / members.service transitively import axios's ESM build this jest
// config can't parse. This spec only needs stand-ins with the methods the tool delegates to.
jest.mock('../../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../../members/members.service', () => ({ MembersService: jest.fn() }));

import { IrlEventsTool } from './irl-events.tool';
import { HuskyAuthContext } from './husky-auth-context';

const DAY = 24 * 60 * 60 * 1000;

function event(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'event-nyc',
    name: 'Climate Week NYC',
    type: 'IN_PERSON',
    description: 'Climate gathering',
    websiteURL: 'https://example.com',
    startDate: new Date(Date.now() + 5 * DAY),
    endDate: new Date(Date.now() + 6 * DAY),
    resources: [],
    locationUid: 'loc-nyc',
    location: { location: 'New York', timezone: 'America/New_York', resources: [] },
    ...overrides,
  };
}

function attendee(
  memberUid: string,
  name: string,
  team: { uid: string; name: string } | null,
  extra: Record<string, unknown> = {}
) {
  return {
    count: 0,
    memberUid,
    topics: [],
    isHost: false,
    isSpeaker: false,
    isSponsor: false,
    member: { name, teamMemberRoles: team ? [{ role: 'Engineer', team }] : [] },
    team: team ?? {},
    ...extra,
  };
}

function withCount(attendees: ReturnType<typeof attendee>[], total = attendees.length) {
  return attendees.map((a) => ({ ...a, count: total }));
}

const filoz = { uid: 'team-filoz', name: 'FilOz' };
const ftc = { uid: 'team-ftc', name: 'Funding the Commons' };
const polaris = { uid: 'team-polaris', name: 'Polaris Labs' };

function teamProfile(team: { uid: string; name: string }, overrides: Record<string, unknown> = {}) {
  return {
    ...team,
    shortDescription: null,
    longDescription: null,
    industryTags: [],
    technologies: [],
    teamFocusAreas: [],
    teamMemberRoles: [],
    ...overrides,
  };
}

describe('IrlEventsTool', () => {
  const logger = { error: jest.fn(), info: jest.fn() };

  function setup() {
    const prisma = {
      pLEventLocation: { findMany: jest.fn().mockResolvedValue([]) },
      pLEvent: { findMany: jest.fn().mockResolvedValue([event()]) },
      team: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const membersService = { findMemberByEmail: jest.fn().mockResolvedValue(null) };
    const guestsService = {
      filterEventsByAttendanceAndAdminStatus: jest.fn<Promise<any[]>, [string[], any[], any]>((_filtered, events) =>
        Promise.resolve(events)
      ),
      getPLEventGuestsByLocationAndType: jest.fn().mockResolvedValue([]),
    };
    const tool = new IrlEventsTool(logger as any, prisma as any, guestsService as any, membersService as any);
    return { tool, prisma, guestsService, membersService };
  }

  function execute(tool: IrlEventsTool, args: Record<string, unknown>, auth: HuskyAuthContext = { isLoggedIn: false }) {
    const coreTool = tool.getTool(auth);
    if (!coreTool.execute) {
      throw new Error('tool has no execute');
    }
    return coreTool.execute(args, { toolCallId: 'call-1', messages: [] });
  }

  beforeEach(() => jest.clearAllMocks());

  it('answers "who is going to an upcoming event from teams working on storage"', async () => {
    const { tool, prisma, guestsService } = setup();
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue(
      withCount([
        attendee('m-shannon', 'Shannon Wells', filoz),
        attendee('m-david', 'David Casey', ftc),
        attendee('m-lachrista', 'La Christa Eccles', polaris),
        attendee('m-bill', 'Bill Warren', null, { topics: ['Storage', 'Compute'] }),
      ])
    );
    prisma.team.findMany.mockResolvedValue([
      teamProfile(filoz, { longDescription: 'FilOz stewards the Filecoin storage network' }),
      teamProfile(ftc, {
        teamFocusAreas: [{ focusArea: { title: 'Public Goods' }, ancestorArea: { title: 'Public Goods' } }],
      }),
      teamProfile(polaris, { industryTags: [{ title: 'Decentralized Storage' }] }),
    ]);

    const result = await execute(tool, { search: 'Climate Week', timeframe: 'upcoming', attendeeTopic: 'storage' });

    // Upcoming-only: a single query bounded below by now.
    expect(prisma.pLEvent.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.pLEvent.findMany.mock.calls[0][0].where;
    expect(where.isDeleted).toBe(false);
    expect(where.endDate.gte).toBeInstanceOf(Date);

    expect(result).toContain('Status: Upcoming or ongoing');
    expect(result).toContain('Attendees from teams working on "storage" (3)');
    expect(result).toContain('Shannon Wells — FilOz');
    expect(result).toContain('La Christa Eccles — Polaris Labs');
    expect(result).toContain('Bill Warren'); // matched through their own registered topic
    expect(result).not.toContain('David Casey');
    expect(result).toContain('[MemberLink](/members/m-shannon)');
  });

  it('only lets current team roles vouch for a topic, not the team the attendee registered with', async () => {
    // The registered team (from the page rows) always counts; other teams count only while the
    // member's role there is active, which is why teams are re-read with an active-role filter.
    const { tool, prisma, guestsService } = setup();
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue(
      withCount([attendee('m-david', 'David Casey', ftc), attendee('m-eve', 'Eve', null)])
    );
    prisma.team.findMany.mockResolvedValue([
      teamProfile(ftc),
      // FilOz: David's role there has ended (not returned by the active-role select), Eve's is current.
      teamProfile(filoz, { industryTags: [{ title: 'Storage' }], teamMemberRoles: [{ memberUid: 'm-eve' }] }),
    ]);

    const result = await execute(tool, { search: 'Climate Week', timeframe: 'upcoming', attendeeTopic: 'storage' });

    const teamWhere = prisma.team.findMany.mock.calls[0][0].where;
    expect(teamWhere.OR[0]).toEqual({ uid: { in: ['team-ftc'] } });
    expect(teamWhere.OR[1].teamMemberRoles.some.OR).toEqual([
      { endDate: null },
      { endDate: { gte: expect.any(Date) } },
    ]);
    expect(result).toContain('Attendees from teams working on "storage" (1)');
    expect(result).toContain('- Eve');
    expect(result).not.toContain('David Casey');
  });

  it('lists every attendee when no filter is given, without loading team profiles', async () => {
    const { tool, prisma, guestsService } = setup();
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue(
      withCount([
        attendee('m-shannon', 'Shannon Wells', filoz, { isSpeaker: true }),
        attendee('m-david', 'David Casey', ftc),
      ])
    );

    const result = await execute(tool, { search: 'Climate Week', timeframe: 'upcoming' });

    expect(result).toContain('Attendees (2)');
    expect(result).toContain('Shannon Wells — FilOz (Speaker)');
    expect(result).toContain('David Casey — Funding the Commons');
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });

  it('filters attendees by guestName itself, since the page service ignores gathering-level guests in its search', async () => {
    const { tool, guestsService } = setup();
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue(
      withCount([attendee('m-shannon', 'Shannon Wells', filoz), attendee('m-david', 'David Casey', ftc)])
    );

    const result = await execute(tool, { search: 'Climate Week', timeframe: 'upcoming', guestName: 'filoz' });

    expect(guestsService.getPLEventGuestsByLocationAndType.mock.calls[0][1]).not.toHaveProperty('search');
    expect(result).toContain('Attendees named like "filoz" (1)');
    expect(result).toContain('Shannon Wells');
    expect(result).not.toContain('David Casey');
  });

  it("resolves the viewer through the page's member lookup, once per answer, and scopes the fetch to event and viewer", async () => {
    const { tool, guestsService, membersService } = setup();
    const viewer = { uid: 'member-1', deletedAt: null, memberRoles: [], effectivePermissionCodes: [] };
    membersService.findMemberByEmail.mockResolvedValue(viewer);
    const coreTool = tool.getTool({ isLoggedIn: true, memberUid: 'member-1', email: 'm1@example.com' });

    await coreTool.execute?.({ search: 'Climate Week', timeframe: 'upcoming' }, { toolCallId: 'c1', messages: [] });
    await coreTool.execute?.({ search: 'Climate Week', timeframe: 'upcoming' }, { toolCallId: 'c2', messages: [] });

    // The page resolves its viewer (roles + RBAC permissions) through this lookup, so the tool must too.
    expect(membersService.findMemberByEmail).toHaveBeenCalledTimes(1);
    expect(membersService.findMemberByEmail).toHaveBeenCalledWith('m1@example.com');
    expect(guestsService.filterEventsByAttendanceAndAdminStatus).toHaveBeenCalledWith([], expect.any(Array), viewer);
    expect(guestsService.getPLEventGuestsByLocationAndType).toHaveBeenCalledWith(
      'loc-nyc',
      expect.objectContaining({ filteredEvents: ['event-nyc'] }),
      viewer
    );
  });

  it('for anonymous callers excludes invite-only events in the query and passes a null viewer', async () => {
    const { tool, prisma, guestsService, membersService } = setup();
    prisma.pLEvent.findMany.mockResolvedValue([event()]);

    const result = await execute(tool, { location: 'New York', timeframe: 'upcoming' });

    expect(membersService.findMemberByEmail).not.toHaveBeenCalled();
    const where = prisma.pLEvent.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ type: null }, { type: { not: 'INVITE_ONLY' } }] }]);
    expect(guestsService.filterEventsByAttendanceAndAdminStatus).toHaveBeenCalledWith([], expect.any(Array), null);
    expect(guestsService.getPLEventGuestsByLocationAndType).toHaveBeenCalledWith('loc-nyc', expect.anything(), null);
    expect(result).toContain('Climate Week NYC');
  });

  it('without a timeframe lists upcoming events (soonest first) before past ones (latest first)', async () => {
    const { tool, prisma } = setup();
    const past = event({
      uid: 'event-old',
      name: 'Old Summit',
      startDate: new Date(Date.now() - 400 * DAY),
      endDate: new Date(Date.now() - 399 * DAY),
    });
    prisma.pLEvent.findMany.mockResolvedValueOnce([event()]).mockResolvedValueOnce([past, event()]);

    const result = (await execute(tool, { location: 'New York' })) as string;

    expect(prisma.pLEvent.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.pLEvent.findMany.mock.calls[0][0].where.endDate.gte).toBeInstanceOf(Date);
    expect(prisma.pLEvent.findMany.mock.calls[0][0].orderBy).toEqual({ startDate: 'asc' });
    expect(prisma.pLEvent.findMany.mock.calls[1][0].where.endDate.lt).toBeInstanceOf(Date);
    expect(prisma.pLEvent.findMany.mock.calls[1][0].orderBy).toEqual({ startDate: 'desc' });
    expect(result.indexOf('Climate Week NYC')).toBeLessThan(result.indexOf('Old Summit'));
    expect(result.match(/Event ID:/g)).toHaveLength(2); // the duplicate row is folded
  });

  it('says so when the topic filter leaves no attendees, rather than dropping the event', async () => {
    const { tool, prisma, guestsService } = setup();
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue(
      withCount([attendee('m-david', 'David Casey', ftc)])
    );
    prisma.team.findMany.mockResolvedValue([teamProfile(ftc)]);

    const result = await execute(tool, { search: 'Climate Week', timeframe: 'upcoming', attendeeTopic: 'storage' });

    expect(result).toContain('Climate Week NYC');
    expect(result).toContain('none of the listed attendees are from teams working on "storage"');
  });

  it('flags when the page service returned only the first page of attendees', async () => {
    const { tool, guestsService } = setup();
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue(
      withCount([attendee('m-david', 'David Casey', ftc)], 450)
    );

    const result = await execute(tool, { search: 'Climate Week', timeframe: 'upcoming', attendeeTopic: 'storage' });

    expect(result).toContain('only the first 1 of 450 attendees were checked');
  });

  it('keeps the other events when one attendee lookup fails', async () => {
    const { tool, prisma, guestsService } = setup();
    prisma.pLEvent.findMany.mockResolvedValue([event(), event({ uid: 'event-2', name: 'Second Event' })]);
    guestsService.getPLEventGuestsByLocationAndType
      .mockRejectedValueOnce(new Error('pool timeout'))
      .mockResolvedValueOnce(withCount([attendee('m-david', 'David Casey', ftc)]));

    const result = (await execute(tool, { location: 'New York', timeframe: 'upcoming' })) as string;

    expect(result).toContain('Attendees: could not be loaded right now');
    expect(result).toContain('David Casey');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('event-nyc'));
  });

  it('retries a search that matched nothing without filler words, then with its longest word', async () => {
    const { tool, prisma } = setup();
    prisma.pLEvent.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([event()]);

    const result = await execute(tool, { search: 'Climate Week NYC event', timeframe: 'upcoming' });

    const searches = prisma.pLEvent.findMany.mock.calls.map((call) => call[0].where.OR[0].name.contains);
    expect(searches).toEqual(['Climate Week NYC event', 'Climate Week NYC', 'Climate']);
    expect(result).toContain('Climate Week NYC');
  });

  it('retries a lone guestName as the event search and says the guest filter was dropped', async () => {
    const { tool, prisma, guestsService } = setup();
    prisma.pLEvent.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([event()]);
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue(
      withCount([attendee('m-david', 'David Casey', ftc)])
    );

    const result = (await execute(tool, { guestName: 'Climate Week NYC', timeframe: 'upcoming' })) as string;

    expect(prisma.pLEvent.findMany.mock.calls[0][0].where.AND).toHaveLength(2); // guest match + anonymous rule
    const retryWhere = prisma.pLEvent.findMany.mock.calls[1][0].where;
    expect(retryWhere.AND).toHaveLength(1);
    expect(retryWhere.OR[0].name.contains).toBe('Climate Week NYC');
    expect(result).toContain('no attendee named "Climate Week NYC" was found');
    expect(result).toContain('David Casey');
  });

  it('reports no events instead of an empty string', async () => {
    const { tool, prisma } = setup();
    prisma.pLEvent.findMany.mockResolvedValue([]);

    await expect(execute(tool, { search: 'Nope' })).resolves.toMatch(/No IRL events found/);
  });
});
