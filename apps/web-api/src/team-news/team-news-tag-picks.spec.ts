import { TeamNewsQueryService } from './team-news-query.service';
import type { PrismaService } from '../shared/prisma.service';

/**
 * LAB-2999: For You and the digest by news tags. With NEWS_TAG_PICKS_ENABLED
 * the digest picks a member's own and followed teams' stories plus stories
 * sharing any of their tags; without it, picks are exactly as before. The
 * grouped home feed always carries the member's tags and own teams, for the
 * frontend to use behind its own flag.
 */
const row = (uid: string, teamUid: string, tags: string[], hour: number, eventType = 'FUNDING') => ({
  uid,
  teamUid,
  eventType,
  eventDate: new Date(Date.UTC(2026, 7, 20, hour)),
  title: uid,
  summary: '',
  contentHtml: null,
  sourceUrl: `https://example.com/${uid}`,
  sourceUrls: [`https://example.com/${uid}`],
  sourceDomain: 'example.com',
  tags,
  editorialRank: null,
  viewCount: 0,
  createdAt: new Date(Date.UTC(2026, 7, 20, hour)),
  team: { uid: teamUid, name: teamUid, logo: null, teamFocusAreas: [] },
});

function buildService(opts: {
  rows: ReturnType<typeof row>[];
  forYouTeams?: Record<string, string[]>;
  ownTeams?: Record<string, string[]>;
  tags?: Record<string, string[]>;
  preferences?: Record<string, unknown>;
}) {
  const getForYouTeamUidsForMembers = jest.fn(
    async (uids: string[]) => new Map(uids.map((uid) => [uid, opts.forYouTeams?.[uid] ?? []]))
  );
  const getForYouTeamUids = jest.fn(async (uid: string) => opts.forYouTeams?.[uid] ?? []);
  const getOwnTeamUidsForMembers = jest.fn(
    async (uids: string[]) => new Map(uids.map((uid) => [uid, new Set(opts.ownTeams?.[uid] ?? [])]))
  );
  const getEffectiveTagsForMembers = jest.fn(
    async (uids: string[]) => new Map(uids.map((uid) => [uid, new Set(opts.tags?.[uid] ?? [])]))
  );
  const prisma = {
    teamNewsItem: { findMany: jest.fn(async () => opts.rows), findFirst: jest.fn(async () => null) },
    member: {
      findMany: jest.fn(async () =>
        Object.entries(opts.preferences ?? {}).map(([uid, preferences]) => ({ uid, preferences }))
      ),
    },
    focusArea: { findMany: jest.fn(async () => []) },
    teamNewsForumLink: { findMany: jest.fn(async () => []) },
    teamNewsUpvote: { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []) },
  };
  const service = new TeamNewsQueryService(
    prisma as unknown as PrismaService,
    { getForYouTeamUidsForMembers, getForYouTeamUids, getOwnTeamUidsForMembers } as never,
    { getEffectiveTagsForMembers } as never
  );
  return { service, getOwnTeamUidsForMembers, getEffectiveTagsForMembers };
}

const window = { sinceCreatedAt: new Date(Date.UTC(2026, 7, 20)), untilCreatedAt: new Date(Date.UTC(2026, 7, 21)) };
const picksOf = async (service: TeamNewsQueryService, memberUid = 'm1') =>
  (await service.getDigestNewsPicks({ memberUids: [memberUid], ...window })).picks[memberUid].map((i) => i.uid);

describe('getDigestNewsPicks by news tags (LAB-2999)', () => {
  const original = process.env.NEWS_TAG_PICKS_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.NEWS_TAG_PICKS_ENABLED;
    else process.env.NEWS_TAG_PICKS_ENABLED = original;
  });

  const rows = [
    row('ai-unrelated', 'team-x', ['ai'], 18),
    row('own-story', 'team-own', ['launch'], 16),
    row('launch-only', 'team-y', ['launch'], 14),
    row('related', 'team-related', ['desci'], 12),
  ];

  describe('flag off', () => {
    beforeEach(() => delete process.env.NEWS_TAG_PICKS_ENABLED);

    it('picks exactly as before: the For You teams, no tag matching', async () => {
      const { service, getEffectiveTagsForMembers } = buildService({
        rows,
        forYouTeams: { m1: ['team-own', 'team-related'] },
        tags: { m1: ['ai'] },
      });

      expect(await picksOf(service)).toEqual(['own-story', 'related']);
      expect(getEffectiveTagsForMembers).not.toHaveBeenCalled();
    });

    it('still narrows by news categories', async () => {
      const { service } = buildService({
        rows: [row('funding', 'team-own', [], 18, 'FUNDING'), row('launch', 'team-own', [], 16, 'LAUNCH')],
        forYouTeams: { m1: ['team-own'] },
        preferences: { m1: { newsCategories: ['LAUNCH'] } },
      });

      expect(await picksOf(service)).toEqual(['launch']);
    });
  });

  describe('flag on', () => {
    beforeEach(() => (process.env.NEWS_TAG_PICKS_ENABLED = 'true'));

    it("picks own teams' stories and tag matches from any team, newest first", async () => {
      const { service } = buildService({ rows, ownTeams: { m1: ['team-own'] }, tags: { m1: ['ai'] } });

      expect(await picksOf(service)).toEqual(['ai-unrelated', 'own-story']);
    });

    it('drops the related-teams expansion and never matches a legacy verb tag', async () => {
      const { service } = buildService({
        rows,
        forYouTeams: { m1: ['team-related', 'team-y'] },
        ownTeams: { m1: [] },
        tags: { m1: ['ai'] },
      });

      expect(await picksOf(service)).toEqual(['ai-unrelated']);
    });

    it('keeps one story per team', async () => {
      const { service } = buildService({
        rows: [row('newer', 'team-x', ['ai'], 18), row('older', 'team-x', ['ai'], 10)],
        tags: { m1: ['ai'] },
      });

      expect(await picksOf(service)).toEqual(['newer']);
    });

    it('ignores news categories', async () => {
      const { service } = buildService({
        rows: [row('funding', 'team-own', [], 18, 'FUNDING')],
        ownTeams: { m1: ['team-own'] },
        preferences: { m1: { newsCategories: ['LAUNCH'] } },
      });

      expect(await picksOf(service)).toEqual(['funding']);
    });

    it('falls back to the newest network stories for a member with no match', async () => {
      const { service } = buildService({ rows, ownTeams: { m1: [] }, tags: { m1: [] } });

      expect(await picksOf(service)).toEqual(['ai-unrelated', 'own-story', 'launch-only']);
    });

    it('leaves topStory and windowCount as they are', async () => {
      const { service } = buildService({ rows, tags: { m1: ['ai'] } });

      const result = await service.getDigestNewsPicks({ memberUids: ['m1'], ...window });

      expect(result.windowCount).toBe(rows.length);
      expect(result.topStory).toBeNull();
    });
  });
});

describe('listGroupedByFocusArea For You tag fields (LAB-2999)', () => {
  const query = { focus: [], eventType: [], windowDays: 14, page: 1, limit: 50 } as never;

  it("returns the viewer's tags and own teams next to the unchanged forYouTeamUids", async () => {
    const { service } = buildService({
      rows: [],
      forYouTeams: { m1: ['team-own', 'team-related'] },
      ownTeams: { m1: ['team-own'] },
      tags: { m1: ['ai', 'desci'] },
    });

    const result = await service.listGroupedByFocusArea(query, new Set(), 'm1');

    expect(result.forYouTeamUids).toEqual(['team-own', 'team-related']);
    expect(result.forYouOwnTeamUids).toEqual(['team-own']);
    expect(result.forYouTags.sort()).toEqual(['ai', 'desci']);
  });

  it('returns empty tag fields for a signed-out viewer', async () => {
    const { service, getEffectiveTagsForMembers } = buildService({ rows: [] });

    const result = await service.listGroupedByFocusArea(query, new Set(), undefined);

    expect(result.forYouTags).toEqual([]);
    expect(result.forYouOwnTeamUids).toEqual([]);
    expect(getEffectiveTagsForMembers).not.toHaveBeenCalled();
  });
});
