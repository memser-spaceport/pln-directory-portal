jest.mock('ai', () => ({
  generateObject: jest.fn(),
}));

jest.mock('./og-image', () => ({
  fetchOgImageUrl: jest.fn(),
}));

import { NotFoundException } from '@nestjs/common';
import { generateObject } from 'ai';
import { NetworkOverviewStatus } from '@prisma/client';
import type { PrismaService } from '../shared/prisma.service';
import type { AiProviderService } from '../shared/ai-provider.service';
import type { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { NetworkOverviewService } from './network-overview.service';
import { fetchOgImageUrl } from './og-image';

const generateObjectMock = generateObject as jest.MockedFunction<typeof generateObject>;
const fetchOgImageUrlMock = fetchOgImageUrl as jest.MockedFunction<typeof fetchOgImageUrl>;

type PrismaMock = {
  teamNewsItem: { findMany: jest.Mock };
  networkOverview: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
};

const newsRow = {
  uid: 'news-1',
  title: 'Filecoin Network v26 is live',
  summary: 'Capacity shift to demand.',
  sourceUrl: 'https://filecoin.io/blog/v26',
  sourceDomain: 'filecoin.io',
  eventDate: new Date('2026-08-01T00:00:00.000Z'),
  teamUid: 'team-1',
  team: { name: 'Filecoin', logo: { url: 'https://cdn.example.com/fil.png' } },
};

const buildPrisma = (): PrismaMock => ({
  teamNewsItem: { findMany: jest.fn().mockResolvedValue([newsRow]) },
  networkOverview: {
    findFirst: jest.fn(),
    create: jest.fn().mockImplementation(async ({ data }) => ({
      id: 1,
      uid: 'overview-1',
      generatedAt: new Date('2026-08-05T12:00:00.000Z'),
      ...data,
    })),
  },
});

const buildAi = (): AiProviderService =>
  ({
    getResponsesModel: jest.fn().mockReturnValue('mock-model'),
    getModelName: jest.fn().mockReturnValue('gemini-2.5-flash'),
  } as unknown as AiProviderService);

const buildJobs = (): JobOpeningsQueryService =>
  ({
    listJobOpenings: jest.fn().mockResolvedValue({
      groups: [
        {
          team: { name: 'Filecoin' },
          roles: [{ roleTitle: 'Protocol Engineer', location: ['Remote'], workMode: 'REMOTE' }],
        },
      ],
    }),
  } as unknown as JobOpeningsQueryService);

describe('NetworkOverviewService', () => {
  let prisma: PrismaMock;
  let service: NetworkOverviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrisma();
    service = new NetworkOverviewService(prisma as unknown as PrismaService, buildAi(), buildJobs());
    fetchOgImageUrlMock.mockResolvedValue('https://cdn.example.com/og.jpg');
    generateObjectMock.mockResolvedValue({
      object: {
        featuredNewsItemUid: 'news-1',
        leadParagraph: 'Filecoin is shifting from capacity to demand.',
        topStories: [
          {
            headline: 'Filecoin Network v26 is live.',
            detail: 'The upgrade landed this week.',
            sourceTag: 'filecoin',
            newsItemUid: 'news-1',
          },
          {
            headline: 'Story two.',
            detail: 'Detail two.',
            sourceTag: 'protocol',
          },
          {
            headline: 'Story three.',
            detail: 'Detail three.',
            sourceTag: 'blog',
          },
        ],
        generalUpdates: [
          { headline: 'Update one.', detail: 'Detail.', sourceTag: 'protocol' },
          { headline: 'Update two.', detail: 'Detail.', sourceTag: 'research' },
          { headline: 'Update three.', detail: 'Detail.', sourceTag: 'filecoin' },
        ],
      },
    } as never);
  });

  it('persists a READY overview and getLatest returns it', async () => {
    const result = await service.generate({ windowDays: 14, runId: 'run-1' });

    expect(result.status).toBe('READY');
    expect(result.uid).toBe('overview-1');
    expect(prisma.networkOverview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: NetworkOverviewStatus.READY,
        featuredNewsItemUid: 'news-1',
        featuredImageUrl: 'https://cdn.example.com/og.jpg',
        featuredTitle: 'Filecoin Network v26 is live',
        sourceRunId: 'run-1',
        leadParagraph: 'Filecoin is shifting from capacity to demand.',
      }),
    });

    prisma.networkOverview.findFirst.mockResolvedValue({
      uid: 'overview-1',
      generatedAt: new Date('2026-08-05T12:00:00.000Z'),
      windowDays: 14,
      periodStart: new Date('2026-07-22T12:00:00.000Z'),
      periodEnd: new Date('2026-08-05T12:00:00.000Z'),
      featuredNewsItemUid: 'news-1',
      featuredTitle: 'Filecoin Network v26 is live',
      featuredSummary: 'Capacity shift to demand.',
      featuredImageUrl: 'https://cdn.example.com/og.jpg',
      featuredSourceUrl: 'https://filecoin.io/blog/v26',
      featuredTeamName: 'Filecoin',
      leadParagraph: 'Filecoin is shifting from capacity to demand.',
      topStories: [
        {
          headline: 'Filecoin Network v26 is live.',
          detail: 'The upgrade landed this week.',
          sourceTag: 'filecoin',
          newsItemUid: 'news-1',
        },
      ],
      generalUpdates: [],
    });

    const latest = await service.getLatest();
    expect(latest.uid).toBe('overview-1');
    expect(latest.featured.imageUrl).toBe('https://cdn.example.com/og.jpg');
    expect(latest.leadParagraph).toContain('Filecoin');
  });

  it('falls back to team logo when OG fetch returns null', async () => {
    fetchOgImageUrlMock.mockResolvedValueOnce(null);

    await service.generate({ windowDays: 14 });

    expect(prisma.networkOverview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        featuredImageUrl: 'https://cdn.example.com/fil.png',
      }),
    });
  });

  it('skips without writing when there is no news', async () => {
    prisma.teamNewsItem.findMany.mockResolvedValueOnce([]);

    const result = await service.generate({ windowDays: 14 });

    expect(result).toEqual({
      uid: null,
      generatedAt: expect.any(String),
      status: 'SKIPPED',
    });
    expect(prisma.networkOverview.create).not.toHaveBeenCalled();
  });

  it('writes FAILED without deleting prior READY when LLM fails', async () => {
    generateObjectMock.mockRejectedValueOnce(new Error('gemini down'));

    const result = await service.generate({ windowDays: 14 });

    expect(result.status).toBe('FAILED');
    expect(prisma.networkOverview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: NetworkOverviewStatus.FAILED,
        errorMessage: 'gemini down',
      }),
    });
  });

  it('getLatest throws NotFound when no READY row exists', async () => {
    prisma.networkOverview.findFirst.mockResolvedValue(null);
    await expect(service.getLatest()).rejects.toBeInstanceOf(NotFoundException);
  });
});
