jest.mock('../utils/og-image', () => ({
  fetchOgImageUrl: jest.fn(),
}));

import type { PrismaService } from '../shared/prisma.service';
import { fetchOgImageUrl } from '../utils/og-image';
import { TEAM_NEWS_IMAGE_FETCH_CONCURRENCY, TeamNewsImageService } from './team-news-image.service';

const fetchOgImageUrlMock = fetchOgImageUrl as jest.MockedFunction<typeof fetchOgImageUrl>;

type PrismaMock = {
  teamNewsItem: { findMany: jest.Mock; update: jest.Mock };
};

const buildPrismaMock = (): PrismaMock => ({
  teamNewsItem: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
});

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ uid: `news-${i}`, sourceUrl: `https://news.example.com/${i}` }));

describe('TeamNewsImageService.fillImages', () => {
  let prisma: PrismaMock;
  let service: TeamNewsImageService;

  beforeEach(() => {
    fetchOgImageUrlMock.mockReset();
    prisma = buildPrismaMock();
    service = new TeamNewsImageService(prisma as unknown as PrismaService);
  });

  it('stores the image url and the check time', async () => {
    prisma.teamNewsItem.findMany.mockResolvedValue(rows(1));
    fetchOgImageUrlMock.mockResolvedValue('https://cdn.example.com/og.jpg');

    await service.fillImages(['news-0']);

    expect(fetchOgImageUrlMock).toHaveBeenCalledWith('https://news.example.com/0');
    expect(prisma.teamNewsItem.update).toHaveBeenCalledWith({
      where: { uid: 'news-0' },
      data: { imageUrl: 'https://cdn.example.com/og.jpg', imageCheckedAt: expect.any(Date) },
    });
  });

  it('stores null and the check time when the page has no image', async () => {
    prisma.teamNewsItem.findMany.mockResolvedValue(rows(1));
    fetchOgImageUrlMock.mockResolvedValue(null);

    await service.fillImages(['news-0']);

    expect(prisma.teamNewsItem.update).toHaveBeenCalledWith({
      where: { uid: 'news-0' },
      data: { imageUrl: null, imageCheckedAt: expect.any(Date) },
    });
  });

  it('swallows errors and continues with the other items', async () => {
    prisma.teamNewsItem.findMany.mockResolvedValue(rows(3));
    fetchOgImageUrlMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue('https://cdn.example.com/og.jpg');
    prisma.teamNewsItem.update.mockRejectedValueOnce(new Error('db down'));

    await expect(service.fillImages(['news-0', 'news-1', 'news-2'])).resolves.toBeUndefined();
    expect(fetchOgImageUrlMock).toHaveBeenCalledTimes(3);
  });

  it('swallows an error when the items cannot be loaded', async () => {
    prisma.teamNewsItem.findMany.mockRejectedValue(new Error('db down'));

    await expect(service.fillImages(['news-0'])).resolves.toBeUndefined();
    expect(fetchOgImageUrlMock).not.toHaveBeenCalled();
  });

  it('does nothing for an empty list', async () => {
    await service.fillImages([]);
    expect(prisma.teamNewsItem.findMany).not.toHaveBeenCalled();
  });

  it(`runs at most ${TEAM_NEWS_IMAGE_FETCH_CONCURRENCY} fetches at a time`, async () => {
    prisma.teamNewsItem.findMany.mockResolvedValue(rows(10));
    let active = 0;
    let maxActive = 0;
    fetchOgImageUrlMock.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return null;
    });

    await service.fillImages(rows(10).map((r) => r.uid));

    expect(fetchOgImageUrlMock).toHaveBeenCalledTimes(10);
    expect(maxActive).toBe(TEAM_NEWS_IMAGE_FETCH_CONCURRENCY);
  });
});
