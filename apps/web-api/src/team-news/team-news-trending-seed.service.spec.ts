jest.mock('ai', () => ({
  generateObject: jest.fn(),
}));
jest.mock('@ai-sdk/openai', () => ({ openai: { responses: jest.fn() } }));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));

import { generateObject } from 'ai';
import { PrismaService } from '../shared/prisma.service';
import { AiProviderService } from '../shared/ai-provider.service';
import { PROTOCOL_LABS_TEAM_UID } from './team-news-public-list.config';
import { TeamNewsTrendingSeedService } from './team-news-trending-seed.service';
import { TRENDING_SEED_BOT_COUNT } from './team-news-trending-seed.util';

describe('TeamNewsTrendingSeedService', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const update = jest.fn();
  const memberFindUnique = jest.fn();
  const memberCreate = jest.fn();
  const upvoteDeleteMany = jest.fn();
  const upvoteCreateMany = jest.fn();
  const getResponsesModel = jest.fn().mockReturnValue('mock-model');

  const prisma = {
    teamNewsItem: { findMany, findFirst, updateMany, update },
    member: { findUnique: memberFindUnique, create: memberCreate },
    teamNewsUpvote: { deleteMany: upvoteDeleteMany, createMany: upvoteCreateMany },
  } as unknown as PrismaService;

  const aiProvider = { getResponsesModel } as unknown as AiProviderService;

  let service: TeamNewsTrendingSeedService;

  const candidate = (uid: string, teamUid: string, name: string, eventDate: string) => ({
    uid,
    teamUid,
    title: uid.toUpperCase(),
    summary: null,
    eventType: 'LAUNCH',
    eventDate: new Date(eventDate),
    team: { name },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    upvoteDeleteMany.mockResolvedValue({ count: 0 });
    upvoteCreateMany.mockResolvedValue({ count: 1 });
    updateMany.mockResolvedValue({ count: 0 });
    update.mockResolvedValue({});
    memberFindUnique.mockImplementation(({ where }: { where: { externalId: string } }) =>
      Promise.resolve({ uid: `bot-${where.externalId}` })
    );
    service = new TeamNewsTrendingSeedService(prisma, aiProvider);
  });

  it('no-ops when there are no candidates', async () => {
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);

    await expect(service.seedTrending({ createdAfter: '2026-07-30T00:00:00.000Z', limit: 5 })).resolves.toEqual({
      ranked: [],
      editorial: [],
      protocolLabsIncluded: false,
      candidateCount: 0,
    });

    expect(generateObject).not.toHaveBeenCalled();
    expect(upvoteCreateMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ranks via LLM into liked + editorial, clears prior state, and persists both', async () => {
    const candidates = [
      candidate('a', 't1', 'Alpha', '2026-07-29T00:00:00.000Z'),
      candidate('b', 't2', 'Beta', '2026-07-28T00:00:00.000Z'),
      candidate('pl', PROTOCOL_LABS_TEAM_UID, 'Protocol Labs', '2026-07-27T00:00:00.000Z'),
      candidate('c', 't3', 'Gamma', '2026-07-26T00:00:00.000Z'),
      candidate('d', 't4', 'Delta', '2026-07-25T00:00:00.000Z'),
      candidate('e', 't5', 'Epsilon', '2026-07-24T00:00:00.000Z'),
      candidate('f', 't6', 'Zeta', '2026-07-23T00:00:00.000Z'),
      candidate('g', 't7', 'Eta', '2026-07-22T00:00:00.000Z'),
    ];
    findMany.mockResolvedValue(candidates);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        likedUids: ['a', 'b', 'c', 'd', 'x-invalid'],
        editorialUids: ['e', 'f', 'g'],
      },
    });

    const result = await service.seedTrending({
      createdAfter: '2026-07-30T00:00:00.000Z',
      limit: 5,
    });

    expect(result.candidateCount).toBe(8);
    expect(result.protocolLabsIncluded).toBe(true);
    expect(result.ranked).toHaveLength(5);
    expect(result.ranked.map((r) => r.uid)).toContain('pl');
    expect(result.ranked[0].uid).not.toBe('pl');
    expect(result.editorial).toEqual([
      { uid: 'e', rank: 1 },
      { uid: 'f', rank: 2 },
      { uid: 'g', rank: 3 },
    ]);
    // Liked and editorial must be disjoint.
    const likedSet = new Set(result.ranked.map((r) => r.uid));
    for (const row of result.editorial) {
      expect(likedSet.has(row.uid)).toBe(false);
    }

    expect(memberFindUnique).toHaveBeenCalledTimes(TRENDING_SEED_BOT_COUNT);
    expect(upvoteDeleteMany).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { editorialRank: { not: null } },
      data: { editorialRank: null },
    });
    expect(update).toHaveBeenCalledTimes(3);
    expect(upvoteCreateMany).toHaveBeenCalledTimes(5);
    for (const row of result.ranked) {
      expect(row.upvoteCount).toBeGreaterThanOrEqual(4);
      expect(row.upvoteCount).toBeLessThanOrEqual(10);
    }
  });

  it('removes overlapping UIDs from liked when editorial wins', async () => {
    const candidates = [
      candidate('a', 't1', 'Alpha', '2026-07-29T00:00:00.000Z'),
      candidate('b', 't2', 'Beta', '2026-07-28T00:00:00.000Z'),
      candidate('c', 't3', 'Gamma', '2026-07-27T00:00:00.000Z'),
      candidate('d', 't4', 'Delta', '2026-07-26T00:00:00.000Z'),
      candidate('e', 't5', 'Epsilon', '2026-07-25T00:00:00.000Z'),
      candidate('f', 't6', 'Zeta', '2026-07-24T00:00:00.000Z'),
      candidate('g', 't7', 'Eta', '2026-07-23T00:00:00.000Z'),
      candidate('h', 't8', 'Theta', '2026-07-22T00:00:00.000Z'),
    ];
    findMany.mockResolvedValue(candidates);
    findFirst.mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        // Overlap: a, b appear in both — editorial wins.
        likedUids: ['a', 'b', 'c', 'd', 'e'],
        editorialUids: ['a', 'b', 'f'],
      },
    });

    const result = await service.seedTrending({
      createdAfter: '2026-07-30T00:00:00.000Z',
      limit: 5,
    });

    expect(result.editorial.map((r) => r.uid)).toEqual(['a', 'b', 'f']);
    const likedUids = result.ranked.map((r) => r.uid);
    expect(likedUids).not.toContain('a');
    expect(likedUids).not.toContain('b');
    expect(likedUids).not.toContain('f');
    expect(likedUids).toHaveLength(5);
  });
});
