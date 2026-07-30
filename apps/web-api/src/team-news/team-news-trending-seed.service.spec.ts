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
  const memberFindUnique = jest.fn();
  const memberCreate = jest.fn();
  const upvoteDeleteMany = jest.fn();
  const upvoteCreateMany = jest.fn();
  const getResponsesModel = jest.fn().mockReturnValue('mock-model');

  const prisma = {
    teamNewsItem: { findMany, findFirst },
    member: { findUnique: memberFindUnique, create: memberCreate },
    teamNewsUpvote: { deleteMany: upvoteDeleteMany, createMany: upvoteCreateMany },
  } as unknown as PrismaService;

  const aiProvider = { getResponsesModel } as unknown as AiProviderService;

  let service: TeamNewsTrendingSeedService;

  beforeEach(() => {
    jest.clearAllMocks();
    upvoteDeleteMany.mockResolvedValue({ count: 0 });
    upvoteCreateMany.mockResolvedValue({ count: 1 });
    memberFindUnique.mockImplementation(({ where }: { where: { externalId: string } }) =>
      Promise.resolve({ uid: `bot-${where.externalId}` })
    );
    service = new TeamNewsTrendingSeedService(prisma, aiProvider);
  });

  it('no-ops when there are no candidates', async () => {
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);

    await expect(
      service.seedTrending({ createdAfter: '2026-07-30T00:00:00.000Z', limit: 7 })
    ).resolves.toEqual({ ranked: [], protocolLabsIncluded: false, candidateCount: 0 });

    expect(generateObject).not.toHaveBeenCalled();
    expect(upvoteCreateMany).not.toHaveBeenCalled();
  });

  it('ranks via LLM, force-includes PL, clears bot upvotes, and seeds TeamNewsUpvote rows', async () => {
    const candidates = [
      {
        uid: 'a',
        teamUid: 't1',
        title: 'A',
        summary: null,
        eventType: 'LAUNCH',
        eventDate: new Date('2026-07-29T00:00:00.000Z'),
        team: { name: 'Alpha' },
      },
      {
        uid: 'b',
        teamUid: 't2',
        title: 'B',
        summary: null,
        eventType: 'FUNDING',
        eventDate: new Date('2026-07-28T00:00:00.000Z'),
        team: { name: 'Beta' },
      },
      {
        uid: 'pl',
        teamUid: PROTOCOL_LABS_TEAM_UID,
        title: 'PL news',
        summary: null,
        eventType: 'ANNOUNCEMENT',
        eventDate: new Date('2026-07-27T00:00:00.000Z'),
        team: { name: 'Protocol Labs' },
      },
      {
        uid: 'c',
        teamUid: 't3',
        title: 'C',
        summary: null,
        eventType: 'OTHER',
        eventDate: new Date('2026-07-26T00:00:00.000Z'),
        team: { name: 'Gamma' },
      },
      {
        uid: 'd',
        teamUid: 't4',
        title: 'D',
        summary: null,
        eventType: 'OTHER',
        eventDate: new Date('2026-07-25T00:00:00.000Z'),
        team: { name: 'Delta' },
      },
    ];
    findMany.mockResolvedValue(candidates);
    (generateObject as jest.Mock).mockResolvedValue({
      object: { rankedUids: ['a', 'b', 'c', 'd', 'x-invalid'] },
    });

    const result = await service.seedTrending({
      createdAfter: '2026-07-30T00:00:00.000Z',
      limit: 5,
    });

    expect(result.candidateCount).toBe(5);
    expect(result.protocolLabsIncluded).toBe(true);
    expect(result.ranked).toHaveLength(5);
    expect(result.ranked.map((r) => r.uid)).toContain('pl');
    expect(result.ranked[0].uid).not.toBe('pl');
    expect(memberFindUnique).toHaveBeenCalledTimes(TRENDING_SEED_BOT_COUNT);
    expect(upvoteDeleteMany).toHaveBeenCalled();
    expect(upvoteCreateMany).toHaveBeenCalledTimes(5);
    for (const row of result.ranked) {
      expect(row.upvoteCount).toBeGreaterThanOrEqual(2);
      expect(row.upvoteCount).toBeLessThanOrEqual(10);
    }
  });
});
