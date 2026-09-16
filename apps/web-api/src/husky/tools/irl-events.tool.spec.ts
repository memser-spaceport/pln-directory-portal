// `ai` pulls in untranspiled ESM this jest config can't parse; `tool()` just needs to hand
// back its config object so `getTool()` yields something with a callable `execute`.
jest.mock('ai', () => ({ tool: (config: any) => config }));
// pl-event-guests.service transitively imports posthog-node / axios ESM builds this jest config
// can't parse. This spec only needs a stand-in with the two methods the tool delegates to.
jest.mock('../../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));

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
    ...overrides,
  };
}

describe('IrlEventsTool', () => {
  const logger = { error: jest.fn(), info: jest.fn() };

  function setup() {
    const prisma = {
      pLEventLocation: { findMany: jest.fn().mockResolvedValue([]) },
      pLEvent: { findMany: jest.fn().mockResolvedValue([event()]) },
      member: { findFirst: jest.fn().mockResolvedValue(null) },
      team: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const guestsService = {
      filterEventsByAttendanceAndAdminStatus: jest.fn<Promise<any[]>, [string[], any[], any]>((_filtered, events) =>
        Promise.resolve(events)
      ),
      getPLEventGuestsByLocationAndType: jest.fn().mockResolvedValue([]),
    };
    const tool = new IrlEventsTool(logger as any, prisma as any, guestsService as any);
    return { tool, prisma, guestsService };
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
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue([
      attendee('m-shannon', 'Shannon Wells', filoz),
      attendee('m-david', 'David Casey', ftc),
      attendee('m-lachrista', 'La Christa Eccles', polaris),
      attendee('m-bill', 'Bill Warren', null, { topics: ['Storage', 'Compute'] }),
    ]);
    prisma.team.findMany.mockResolvedValue([
      teamProfile(filoz, { longDescription: 'FilOz stewards the Filecoin storage network' }),
      teamProfile(ftc, {
        teamFocusAreas: [{ focusArea: { title: 'Public Goods' }, ancestorArea: { title: 'Public Goods' } }],
      }),
      teamProfile(polaris, { industryTags: [{ title: 'Decentralized Storage' }] }),
    ]);

    const result = await execute(tool, { search: 'Climate Week', timeframe: 'upcoming', attendeeTopic: 'storage' });

    // Upcoming-only filter is pushed into the event query.
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

  it('lists every attendee when no topic filter is given, without loading team profiles', async () => {
    const { tool, prisma, guestsService } = setup();
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue([
      attendee('m-shannon', 'Shannon Wells', filoz, { isSpeaker: true }),
      attendee('m-david', 'David Casey', ftc),
    ]);

    const result = await execute(tool, { search: 'Climate Week' });

    expect(result).toContain('Attendees (2)');
    expect(result).toContain('Shannon Wells — FilOz (Speaker)');
    expect(result).toContain('David Casey — Funding the Commons');
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });

  it('fetches attendees through the IRL Gatherings page service, scoped to the event and the viewer', async () => {
    const { tool, prisma, guestsService } = setup();
    const viewer = { uid: 'member-1', memberRoles: [] };
    prisma.member.findFirst.mockResolvedValue(viewer);

    await execute(tool, { search: 'Climate Week' }, { isLoggedIn: true, memberUid: 'member-1' });

    expect(prisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uid: 'member-1', deletedAt: null } })
    );
    expect(guestsService.filterEventsByAttendanceAndAdminStatus).toHaveBeenCalledWith([], expect.any(Array), viewer);
    expect(guestsService.getPLEventGuestsByLocationAndType).toHaveBeenCalledWith(
      'loc-nyc',
      expect.objectContaining({ filteredEvents: ['event-nyc'] }),
      viewer
    );
  });

  it('passes a null viewer for anonymous callers so invite-only events and gated fields stay hidden', async () => {
    const { tool, prisma, guestsService } = setup();
    prisma.pLEvent.findMany.mockResolvedValue([
      event(),
      event({ uid: 'event-private', name: 'Private Dinner', type: 'INVITE_ONLY' }),
    ]);
    guestsService.filterEventsByAttendanceAndAdminStatus.mockImplementation((_filtered, events, member) =>
      Promise.resolve(member ? events : events.filter((e) => e.type !== 'INVITE_ONLY'))
    );

    const result = await execute(tool, { location: 'New York' });

    expect(prisma.member.findFirst).not.toHaveBeenCalled();
    expect(guestsService.filterEventsByAttendanceAndAdminStatus).toHaveBeenCalledWith([], expect.any(Array), null);
    expect(guestsService.getPLEventGuestsByLocationAndType).toHaveBeenCalledTimes(1);
    expect(guestsService.getPLEventGuestsByLocationAndType).toHaveBeenCalledWith('loc-nyc', expect.anything(), null);
    expect(result).toContain('Climate Week NYC');
    expect(result).not.toContain('Private Dinner');
  });

  it('says so when the topic filter leaves no attendees, rather than dropping the event', async () => {
    const { tool, prisma, guestsService } = setup();
    guestsService.getPLEventGuestsByLocationAndType.mockResolvedValue([attendee('m-david', 'David Casey', ftc)]);
    prisma.team.findMany.mockResolvedValue([teamProfile(ftc)]);

    const result = await execute(tool, { search: 'Climate Week', attendeeTopic: 'storage' });

    expect(result).toContain('Climate Week NYC');
    expect(result).toContain('none of the listed attendees are from teams working on "storage"');
  });

  it('retries a search that matched nothing without filler words, then with its longest word', async () => {
    const { tool, prisma } = setup();
    prisma.pLEvent.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([event()]);

    const result = await execute(tool, { search: 'Climate Week NYC event' });

    const searches = prisma.pLEvent.findMany.mock.calls.map((call) => call[0].where.OR[0].name.contains);
    expect(searches).toEqual(['Climate Week NYC event', 'Climate Week NYC', 'Climate']);
    expect(result).toContain('Climate Week NYC');
  });

  it('retries a lone guestName as the event search when no event has such a guest', async () => {
    const { tool, prisma, guestsService } = setup();
    prisma.pLEvent.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([event()]);

    const result = await execute(tool, { guestName: 'Climate Week NYC', timeframe: 'upcoming' });

    expect(prisma.pLEvent.findMany.mock.calls[0][0].where.AND).toBeDefined();
    const retryWhere = prisma.pLEvent.findMany.mock.calls[1][0].where;
    expect(retryWhere.AND).toBeUndefined();
    expect(retryWhere.OR[0].name.contains).toBe('Climate Week NYC');
    expect(guestsService.getPLEventGuestsByLocationAndType).toHaveBeenCalledWith(
      'loc-nyc',
      expect.objectContaining({ search: undefined }),
      null
    );
    expect(result).toContain('Climate Week NYC');
  });

  it('reports no events instead of an empty string', async () => {
    const { tool, prisma } = setup();
    prisma.pLEvent.findMany.mockResolvedValue([]);

    await expect(execute(tool, { search: 'Nope' })).resolves.toMatch(/No IRL events found/);
  });
});
