import { FollowsService } from '../follows/follows.service';
import { PrismaService } from '../shared/prisma.service';
import { formatFollowerCount, TeamNewsSuggestionsService } from './team-news-suggestions.service';

describe('formatFollowerCount', () => {
  it('formats compact follower counts', () => {
    expect(formatFollowerCount(0)).toBe('0');
    expect(formatFollowerCount(640)).toBe('640');
    expect(formatFollowerCount(1200)).toBe('1.2k');
    expect(formatFollowerCount(10000)).toBe('10k');
  });
});

describe('TeamNewsSuggestionsService', () => {
  let service: TeamNewsSuggestionsService;

  const teamMemberRoleFindMany = jest.fn();
  const teamFindMany = jest.fn();
  const getFollowedTeamUids = jest.fn();
  const countFollowersByTeam = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getFollowedTeamUids.mockResolvedValue(new Set());
    countFollowersByTeam.mockResolvedValue(new Map());
    teamMemberRoleFindMany.mockResolvedValue([]);
    teamFindMany.mockResolvedValue([]);

    service = new TeamNewsSuggestionsService(
      {
        teamMemberRole: { findMany: teamMemberRoleFindMany },
        team: { findMany: teamFindMany },
      } as unknown as PrismaService,
      {
        getFollowedTeamUids,
        countFollowersByTeam,
      } as unknown as FollowsService
    );
  });

  it('returns an empty list when the member has no team and no follows', async () => {
    await expect(service.getFollowSuggestions('member-1')).resolves.toEqual({ items: [] });
    expect(teamFindMany).not.toHaveBeenCalled();
  });

  it('excludes followed/joined teams and requires a shared attribute + recent news', async () => {
    teamMemberRoleFindMany.mockResolvedValue([{ teamUid: 'seed-team' }]);
    getFollowedTeamUids.mockResolvedValue(new Set(['followed-team']));

    // First call loads seed teams for the interest profile; second loads candidates.
    teamFindMany
      .mockResolvedValueOnce([
        {
          uid: 'seed-team',
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
        {
          uid: 'followed-team',
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          uid: 'candidate-1',
          name: 'Banyan Storage',
          shortDescription: 'Decentralized storage network',
          logo: { url: 'https://logo' },
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
      ]);

    countFollowersByTeam.mockResolvedValue(new Map([['candidate-1', 1200]]));

    const result = await service.getFollowSuggestions('member-1');

    expect(result.items).toEqual([
      {
        uid: 'candidate-1',
        name: 'Banyan Storage',
        logo: 'https://logo',
        shortDescription: 'Decentralized storage network',
        reason: 'Storage · 1.2k followers',
      },
    ]);

    expect(teamFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { uid: { notIn: expect.arrayContaining(['seed-team', 'followed-team']) } },
            { newsItems: { some: { eventDate: { gte: expect.any(Date) } } } },
          ]),
        }),
      })
    );
  });

  it('returns null shortDescription when the team has none', async () => {
    teamMemberRoleFindMany.mockResolvedValue([{ teamUid: 'seed-team' }]);
    getFollowedTeamUids.mockResolvedValue(new Set());

    teamFindMany
      .mockResolvedValueOnce([
        {
          uid: 'seed-team',
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          uid: 'candidate-1',
          name: 'No Desc Team',
          shortDescription: null,
          logo: null,
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
      ]);

    countFollowersByTeam.mockResolvedValue(new Map([['candidate-1', 10]]));

    const result = await service.getFollowSuggestions('member-1');

    expect(result.items[0]).toMatchObject({
      uid: 'candidate-1',
      shortDescription: null,
      reason: 'Storage · 10 followers',
    });
  });

  it('respects the limit param', async () => {
    teamMemberRoleFindMany.mockResolvedValue([{ teamUid: 'seed-team' }]);
    getFollowedTeamUids.mockResolvedValue(new Set());

    const candidates = Array.from({ length: 5 }, (_, i) => ({
      uid: `team-${i}`,
      name: `Team ${i}`,
      shortDescription: null,
      logo: null,
      teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
      communityAffiliations: [],
      industryTags: [],
    }));

    teamFindMany
      .mockResolvedValueOnce([
        {
          uid: 'seed-team',
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
      ])
      .mockResolvedValueOnce(candidates);

    countFollowersByTeam.mockResolvedValue(new Map());

    const result = await service.getFollowSuggestions('member-1', 2);

    expect(result.items).toHaveLength(2);
  });

  it('returns a stable order for the same member on the same day', async () => {
    teamMemberRoleFindMany.mockResolvedValue([{ teamUid: 'seed-team' }]);
    getFollowedTeamUids.mockResolvedValue(new Set());

    const candidates = [
      {
        uid: 'team-a',
        name: 'Alpha',
        shortDescription: null,
        logo: null,
        teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
        communityAffiliations: [],
        industryTags: [],
      },
      {
        uid: 'team-b',
        name: 'Beta',
        shortDescription: null,
        logo: null,
        teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
        communityAffiliations: [],
        industryTags: [],
      },
      {
        uid: 'team-c',
        name: 'Gamma',
        shortDescription: null,
        logo: null,
        teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
        communityAffiliations: [],
        industryTags: [],
      },
    ];

    teamFindMany
      .mockResolvedValueOnce([
        {
          uid: 'seed-team',
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
      ])
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce([
        {
          uid: 'seed-team',
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
      ])
      .mockResolvedValueOnce([...candidates].reverse());

    countFollowersByTeam.mockResolvedValue(new Map());

    const first = await service.getFollowSuggestions('member-1');
    const second = await service.getFollowSuggestions('member-1');

    expect(first.items.map((i) => i.uid)).toEqual(second.items.map((i) => i.uid));
  });
});
