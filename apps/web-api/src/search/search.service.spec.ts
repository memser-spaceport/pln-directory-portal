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
