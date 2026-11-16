import { PrismaService } from '../shared/prisma.service';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { isEmailQuery, SearchService } from './search.service';

describe('SearchService email lookup (LAB-2881)', () => {
  let service: SearchService;

  const memberFindMany = jest.fn();
  const searchWithLimit = jest.fn();

  const prismaMock = { member: { findMany: memberFindMany } } as unknown as PrismaService;
  const openSearchMock = { searchWithLimit } as unknown as OpenSearchService;

  const osHits = (index: string, hits: Array<{ _id: string; _source: Record<string, unknown> }>) =>
    index === 'member'
      ? { body: { hits: { hits: hits.map((h) => ({ ...h, _score: 1 })) } } }
      : { body: { hits: { hits: [] } } };

  const dbMember = (uid: string, name: string) => ({
    uid,
    name,
    scheduleMeetingCount: 2,
    officeHours: null,
    image: { url: `https://img/${uid}.png` },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SearchService(openSearchMock, prismaMock);
    searchWithLimit.mockImplementation(async (index: string) => osHits(index, []));
    memberFindMany.mockResolvedValue([]);
  });

  describe('isEmailQuery', () => {
    it('needs an "@" and at least 3 trimmed characters', () => {
      expect(isEmailQuery('juan@protocol.ai')).toBe(true);
      expect(isEmailQuery('juan@')).toBe(true);
      expect(isEmailQuery('@protocol.ai')).toBe(true);
      expect(isEmailQuery('  a@  ')).toBe(false);
      expect(isEmailQuery('juan.perez')).toBe(false);
      expect(isEmailQuery('')).toBe(false);
    });
  });

  it('returns the member with a full email, case-insensitive, visible and with showEmail=true only', async () => {
    memberFindMany.mockResolvedValue([dbMember('m1', 'Juan Benet')]);

    const result = await service.fetchAllIndices('  Juan@Protocol.AI ', {
      canReadContacts: true,
      isAuthenticated: true,
    });

    expect(memberFindMany).toHaveBeenCalledTimes(1);
    const args = memberFindMany.mock.calls[0][0];
    expect(args.take).toBe(50);
    expect(args.where.AND).toEqual(
      expect.arrayContaining([
        { email: { contains: 'Juan@Protocol.AI', mode: 'insensitive' } },
        { preferences: { path: ['showEmail'], equals: true } },
        { deletedAt: null },
      ])
    );
    // the directory visibility rule is applied
    expect(JSON.stringify(args.where.AND[0])).toContain('APPROVED');
    // the email is never selected, so it cannot leak into the response
    expect(args.select.email).toBeUndefined();

    expect(result.members.map((m) => m.uid)).toEqual(['m1']);
    expect(result.top.map((m) => m.uid)).toEqual(['m1']);
    expect(result.members[0]).toMatchObject({ uid: 'm1', name: 'Juan Benet', index: 'members', matches: [] });
    expect(JSON.stringify(result)).not.toMatch(/@/);
  });

  it('matches a partial address, puts email matches first and shows a member once', async () => {
    searchWithLimit.mockImplementation(async (index: string) =>
      osHits(index, [
        { _id: 'm2', _source: { name: 'Bio Match', image: '' } },
        { _id: 'm1', _source: { name: 'Juan Benet', image: '' } },
      ])
    );
    memberFindMany.mockResolvedValue([dbMember('m1', 'Juan Benet'), dbMember('m3', 'Ana')]);

    const result = await service.fetchAllIndices('@protocol.ai', { canReadContacts: true, isAuthenticated: true });

    expect(memberFindMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([{ email: { contains: '@protocol.ai', mode: 'insensitive' } }])
    );
    expect(result.members.map((m) => m.uid)).toEqual(['m1', 'm3', 'm2']);
    expect(result.top.slice(0, 3).map((m) => m.uid)).toEqual(['m1', 'm3', 'm2']);
  });

  it('escapes LIKE wildcards, so "%" and "_" match only themselves', async () => {
    await service.fetchAllIndices('%@%', { canReadContacts: true, isAuthenticated: true });
    await service.fetchAllIndices('b_c@', { canReadContacts: true, isAuthenticated: true });

    expect(memberFindMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([{ email: { contains: '\\%@\\%', mode: 'insensitive' } }])
    );
    expect(memberFindMany.mock.calls[1][0].where.AND).toEqual(
      expect.arrayContaining([{ email: { contains: 'b\\_c@', mode: 'insensitive' } }])
    );
  });

  it('does no email lookup without member.contacts.read; name and bio matching stays', async () => {
    searchWithLimit.mockImplementation(async (index: string) =>
      osHits(index, [{ _id: 'm2', _source: { name: 'Bio Match', image: '' } }])
    );

    const loggedOut = await service.fetchAllIndices('juan@protocol.ai', { isAuthenticated: false });
    const l1 = await service.fetchAllIndices('juan@protocol.ai', { isAuthenticated: true, canReadContacts: false });

    expect(memberFindMany).not.toHaveBeenCalled();
    expect(loggedOut.members.map((m) => m.uid)).toEqual(['m2']);
    expect(l1.members.map((m) => m.uid)).toEqual(['m2']);
  });

  it('does no email lookup for a query that does not look like an email', async () => {
    await service.fetchAllIndices('juan', { canReadContacts: true, isAuthenticated: true });
    expect(memberFindMany).not.toHaveBeenCalled();
  });

  it('returns the normal empty members list when no member has the email', async () => {
    memberFindMany.mockResolvedValue([]);
    const result = await service.fetchAllIndices('nobody@nowhere.xyz', {
      canReadContacts: true,
      isAuthenticated: true,
    });
    expect(result.members).toEqual([]);
    expect(result.top).toEqual([]);
  });
});

describe('SearchService.addAdminAccessFields (LAB-3252)', () => {
  const teamFindMany = jest.fn();
  const memberFindMany = jest.fn();
  const policyAssignmentFindMany = jest.fn();
  const prismaMock = {
    team: { findMany: teamFindMany },
    member: { findMany: memberFindMany },
    policyAssignment: { findMany: policyAssignmentFindMany },
  } as unknown as PrismaService;
  const service = new SearchService({} as OpenSearchService, prismaMock);

  const item = (uid: string, index: string) => ({ uid, name: uid, image: '', index, matches: [] });

  beforeEach(() => {
    jest.clearAllMocks();
    teamFindMany.mockResolvedValue([
      { uid: 'team-l1', accessLevel: 'L1' },
      { uid: 'team-l0', accessLevel: 'L0' },
      { uid: 'team-null', accessLevel: null },
    ]);
    memberFindMany.mockResolvedValue([
      { uid: 'member-verified', memberApproval: { state: 'VERIFIED' } },
      { uid: 'member-no-approval', memberApproval: null },
    ]);
    policyAssignmentFindMany.mockResolvedValue([{ memberUid: 'member-no-approval' }]);
  });

  it('adds the team level and the member state and Job Aspirant flag, also in top', async () => {
    const result = await service.addAdminAccessFields({
      events: [item('event-1', 'events')],
      projects: [],
      teams: [item('team-l1', 'teams'), item('team-l0', 'teams'), item('team-null', 'teams')],
      members: [item('member-verified', 'members'), item('member-no-approval', 'members')],
      forumThreads: [],
      top: [item('member-verified', 'members'), item('team-l1', 'teams'), item('event-1', 'events')],
    });

    expect(result.teams.map((t) => t.accessLevel)).toEqual(['L1', 'L0', null]);
    expect(result.members).toEqual([
      expect.objectContaining({ uid: 'member-verified', memberState: 'VERIFIED', isJobAspirant: false }),
      expect.objectContaining({ uid: 'member-no-approval', memberState: 'PENDING', isJobAspirant: true }),
    ]);
    expect(result.top[0]).toMatchObject({ memberState: 'VERIFIED' });
    expect(result.top[1]).toMatchObject({ accessLevel: 'L1' });
    expect(result.top[2]).not.toHaveProperty('accessLevel');
    expect(result.events[0]).not.toHaveProperty('accessLevel');
  });

  it('skips the database when there are no teams or members', async () => {
    const empty = { events: [], projects: [], teams: [], members: [], forumThreads: [], top: [] };

    expect(await service.addAdminAccessFields(empty)).toBe(empty);
    expect(teamFindMany).not.toHaveBeenCalled();
    expect(memberFindMany).not.toHaveBeenCalled();
  });
});
