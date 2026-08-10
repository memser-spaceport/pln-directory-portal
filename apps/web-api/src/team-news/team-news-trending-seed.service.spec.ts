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

  it('no-ops when there are no candidates in batch or window', async () => {
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
    // First call = new batch, second = window.
    findMany.mockResolvedValueOnce(candidates).mockResolvedValueOnce(candidates);
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
    findMany.mockResolvedValueOnce(candidates).mockResolvedValueOnce(candidates);
    findFirst.mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
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

  it('fills editorial from the 14-day window when the new batch is too small', async () => {
    const newBatch = [candidate('new1', 't1', 'Alpha', '2026-08-07T00:00:00.000Z')];
    const window = [
      candidate('new1', 't1', 'Alpha', '2026-08-07T00:00:00.000Z'),
      candidate('w2', 't2', 'Beta', '2026-08-06T00:00:00.000Z'),
      candidate('w3', 't3', 'Gamma', '2026-08-05T00:00:00.000Z'),
      candidate('w4', 't4', 'Delta', '2026-08-04T00:00:00.000Z'),
      candidate('w5', 't5', 'Epsilon', '2026-08-03T00:00:00.000Z'),
      candidate('w6', 't6', 'Zeta', '2026-08-02T00:00:00.000Z'),
      candidate('w7', 't7', 'Eta', '2026-08-01T00:00:00.000Z'),
      candidate('w8', 't8', 'Theta', '2026-07-31T00:00:00.000Z'),
    ];
    findMany.mockResolvedValueOnce(newBatch).mockResolvedValueOnce(window);
    findFirst.mockResolvedValue(null);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        likedUids: ['new1'],
        editorialUids: ['new1'],
      },
    });

    const result = await service.seedTrending({
      createdAfter: '2026-08-10T08:56:00.000Z',
      limit: 5,
    });

    expect(result.editorial).toHaveLength(3);
    expect(result.editorial[0].uid).toBe('new1');
    const editorialSet = new Set(result.editorial.map((e) => e.uid));
    expect(editorialSet.has('w2')).toBe(true);
    expect(editorialSet.has('w3')).toBe(true);
    for (const row of result.ranked) {
      expect(editorialSet.has(row.uid)).toBe(false);
    }
    expect(result.ranked.length).toBeGreaterThanOrEqual(1);
    expect(update).toHaveBeenCalledTimes(3);
  });
});
