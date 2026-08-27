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
  const getFollowedTeamUidsByMembers = jest.fn();
  const countFollowersByTeam = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getFollowedTeamUids.mockResolvedValue(new Set());
    getFollowedTeamUidsByMembers.mockImplementation(async (uids: string[]) => {
      const map = new Map<string, Set<string>>();
      for (const uid of uids) {
        map.set(uid, await getFollowedTeamUids(uid));
      }
      return map;
    });
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
        getFollowedTeamUidsByMembers,
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

  describe('getForYouTeamUids', () => {
    const seedTeam = {
      uid: 'seed-team',
      teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
      communityAffiliations: [],
      industryTags: [],
    };

    const makeCandidate = (uid: string, name: string) => ({
      uid,
      name,
      shortDescription: null,
      logo: null,
      teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
      communityAffiliations: [],
      industryTags: [],
    });

    it('returns an empty list when the member has no team and no follows', async () => {
      await expect(service.getForYouTeamUids('member-1')).resolves.toEqual([]);
      expect(teamFindMany).not.toHaveBeenCalled();
    });

    it('includes memberships even when those teams are not followed', async () => {
      teamMemberRoleFindMany.mockResolvedValue([{ memberUid: 'member-1', teamUid: 'seed-team' }]);
      getFollowedTeamUids.mockResolvedValue(new Set());
      teamFindMany.mockResolvedValueOnce([seedTeam]).mockResolvedValueOnce([]);

      await expect(service.getForYouTeamUids('member-1')).resolves.toEqual(['seed-team']);
    });

    it('unions memberships, follows, and matching candidates without a display cap', async () => {
      teamMemberRoleFindMany.mockResolvedValue([{ memberUid: 'member-1', teamUid: 'seed-team' }]);
      getFollowedTeamUids.mockResolvedValue(new Set(['followed-team']));

      const candidates = Array.from({ length: 25 }, (_, i) => makeCandidate(`cand-${i}`, `Cand ${i}`));
      teamFindMany
        .mockResolvedValueOnce([
          seedTeam,
          {
            uid: 'followed-team',
            teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
            communityAffiliations: [],
            industryTags: [],
          },
        ])
        .mockResolvedValueOnce(candidates);

      const uids = await service.getForYouTeamUids('member-1');

      expect(uids).toEqual(expect.arrayContaining(['seed-team', 'followed-team', 'cand-0', 'cand-24']));
      expect(uids).toHaveLength(27);
    });

    it('still returns seed teams when they have no matching attributes', async () => {
      teamMemberRoleFindMany.mockResolvedValue([{ memberUid: 'member-1', teamUid: 'bare-team' }]);
      getFollowedTeamUids.mockResolvedValue(new Set());
      teamFindMany.mockResolvedValueOnce([
        {
          uid: 'bare-team',
          teamFocusAreas: [],
          communityAffiliations: [],
          industryTags: [],
        },
      ]);

      await expect(service.getForYouTeamUids('member-1')).resolves.toEqual(['bare-team']);
      expect(teamFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getForYouTeamUidsForMembers', () => {
    const seedTeam = {
      uid: 'seed-team',
      teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
      communityAffiliations: [],
      industryTags: [],
    };

    it('returns empty lists when no member has a team or follow', async () => {
      const byMember = await service.getForYouTeamUidsForMembers(['member-1', 'member-2']);

      expect([...byMember.entries()]).toEqual([
        ['member-1', []],
        ['member-2', []],
      ]);
      expect(teamFindMany).not.toHaveBeenCalled();
    });

    it('unions memberships, follows, and matching candidates per member', async () => {
      teamMemberRoleFindMany.mockResolvedValue([
        { memberUid: 'member-1', teamUid: 'seed-team' },
        { memberUid: 'member-2', teamUid: 'seed-team' },
      ]);
      getFollowedTeamUidsByMembers.mockResolvedValue(
        new Map([
          ['member-1', new Set(['followed-team'])],
          ['member-2', new Set()],
        ])
      );
      teamFindMany
        .mockResolvedValueOnce([
          seedTeam,
          {
            uid: 'followed-team',
            teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
            communityAffiliations: [],
            industryTags: [],
          },
        ])
        .mockResolvedValueOnce([
          {
            uid: 'cand-1',
            name: 'Cand 1',
            shortDescription: null,
            logo: null,
            teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
            communityAffiliations: [],
            industryTags: [],
          },
        ]);

      const byMember = await service.getForYouTeamUidsForMembers(['member-1', 'member-2']);

      expect(byMember.get('member-1')).toEqual(expect.arrayContaining(['seed-team', 'followed-team', 'cand-1']));
      expect(byMember.get('member-1')).toHaveLength(3);
      expect(byMember.get('member-2')).toEqual(expect.arrayContaining(['seed-team', 'cand-1']));
      expect(byMember.get('member-2')).toHaveLength(2);
    });

    it('matches getForYouTeamUids for the same member', async () => {
      teamMemberRoleFindMany.mockResolvedValue([{ memberUid: 'member-1', teamUid: 'seed-team' }]);
      getFollowedTeamUids.mockResolvedValue(new Set(['followed-team']));
      const candidates = [
        {
          uid: 'cand-1',
          name: 'Cand 1',
          shortDescription: null,
          logo: null,
          teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
          communityAffiliations: [],
          industryTags: [],
        },
      ];
      teamFindMany
        .mockResolvedValueOnce([
          seedTeam,
          {
            uid: 'followed-team',
            teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
            communityAffiliations: [],
            industryTags: [],
          },
        ])
        .mockResolvedValueOnce(candidates)
        .mockResolvedValueOnce([
          seedTeam,
          {
            uid: 'followed-team',
            teamFocusAreas: [{ ancestorArea: { title: 'Storage' } }],
            communityAffiliations: [],
            industryTags: [],
          },
        ])
        .mockResolvedValueOnce(candidates);

      const single = await service.getForYouTeamUids('member-1');
      const batched = await service.getForYouTeamUidsForMembers(['member-1']);

      expect(batched.get('member-1')).toEqual(single);
    });
  });
});
