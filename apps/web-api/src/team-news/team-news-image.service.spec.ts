jest.mock('../utils/og-image', () => ({
  fetchOgImageUrl: jest.fn(),
  fetchPublicImage: jest.fn(),
}));
jest.mock('./utils/news-image-variants', () => ({
  ...jest.requireActual('./utils/news-image-variants'),
  renderNewsImageVariants: jest.fn(),
}));

import type { PrismaService } from '../shared/prisma.service';
import type { AwsService } from '../utils/aws/aws.service';
import { fetchOgImageUrl, fetchPublicImage } from '../utils/og-image';
import { TEAM_NEWS_IMAGE_FETCH_CONCURRENCY, TeamNewsImageService } from './team-news-image.service';
import { renderNewsImageVariants } from './utils/news-image-variants';

const fetchOgImageUrlMock = fetchOgImageUrl as jest.MockedFunction<typeof fetchOgImageUrl>;
const fetchPublicImageMock = fetchPublicImage as jest.MockedFunction<typeof fetchPublicImage>;
const renderMock = renderNewsImageVariants as jest.MockedFunction<typeof renderNewsImageVariants>;

type AwsMock = { uploadFileToS3: jest.Mock };
const buildAwsMock = (): AwsMock => ({
  uploadFileToS3: jest.fn(async (_file, bucket: string, key: string) => ({ Location: `https://${bucket}.s3/${key}` })),
});

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
  let aws: AwsMock;
  let service: TeamNewsImageService;

  beforeEach(() => {
    // No bucket: these cases cover the og:image fill only.
    delete process.env.AWS_S3_IMAGE_BUCKET_NAME;
    fetchOgImageUrlMock.mockReset();
    fetchPublicImageMock.mockReset();
    renderMock.mockReset();
    prisma = buildPrismaMock();
    aws = buildAwsMock();
    service = new TeamNewsImageService(prisma as unknown as PrismaService, aws as unknown as AwsService);
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

const rendered = (widths: number[]) =>
  widths.map((width, i) => ({
    width,
    height: Math.round((width * 9) / 16),
    version: (['ORIGINAL', 'TINY', 'SMALL', 'MEDIUM', 'LARGE'] as const)[i],
    buffer: Buffer.from(`jpeg-${width}`),
  }));

describe('TeamNewsImageService image copies (LAB-3135)', () => {
  const originalBucket = process.env.AWS_S3_IMAGE_BUCKET_NAME;
  let prisma: PrismaMock;
  let aws: AwsMock;
  let service: TeamNewsImageService;

  beforeEach(() => {
    process.env.AWS_S3_IMAGE_BUCKET_NAME = 'images-bucket';
    fetchOgImageUrlMock.mockReset().mockResolvedValue('https://cdn.example.com/og.jpg');
    fetchPublicImageMock.mockReset().mockResolvedValue(Buffer.from('source'));
    renderMock.mockReset().mockResolvedValue(rendered([1120, 400, 800]));
    prisma = buildPrismaMock();
    prisma.teamNewsItem.findMany.mockResolvedValue(rows(1));
    aws = buildAwsMock();
    service = new TeamNewsImageService(prisma as unknown as PrismaService, aws as unknown as AwsService);
  });

  afterAll(() => {
    if (originalBucket === undefined) delete process.env.AWS_S3_IMAGE_BUCKET_NAME;
    else process.env.AWS_S3_IMAGE_BUCKET_NAME = originalBucket;
  });

  it('uploads each copy as JPEG and links the ORIGINAL with its thumbnails', async () => {
    await service.fillImages(['news-0']);

    expect(fetchPublicImageMock).toHaveBeenCalledWith('https://cdn.example.com/og.jpg');
    expect(aws.uploadFileToS3.mock.calls.map((c) => [c[0].mimetype, c[1], c[2]])).toEqual([
      ['image/jpeg', 'images-bucket', 'team-news/news-0/1120.jpg'],
      ['image/jpeg', 'images-bucket', 'team-news/news-0/400.jpg'],
      ['image/jpeg', 'images-bucket', 'team-news/news-0/800.jpg'],
    ]);
    expect(prisma.teamNewsItem.update).toHaveBeenNthCalledWith(1, {
      where: { uid: 'news-0' },
      data: { imageUrl: 'https://cdn.example.com/og.jpg', imageCheckedAt: expect.any(Date) },
    });
    const linked = prisma.teamNewsItem.update.mock.calls[1][0];
    expect(linked.where).toEqual({ uid: 'news-0' });
    expect(linked.data.image.create).toMatchObject({
      version: 'ORIGINAL',
      width: 1120,
      height: 630,
      type: 'jpeg',
      filename: '1120.jpg',
      url: 'https://images-bucket.s3/team-news/news-0/1120.jpg',
    });
    expect(linked.data.image.create.thumbnails.createMany.data.map((t) => [t.version, t.width, t.url])).toEqual([
      ['TINY', 400, 'https://images-bucket.s3/team-news/news-0/400.jpg'],
      ['SMALL', 800, 'https://images-bucket.s3/team-news/news-0/800.jpg'],
    ]);
  });

  it('makes no copy when the page has no og:image', async () => {
    fetchOgImageUrlMock.mockResolvedValue(null);
    await service.fillImages(['news-0']);
    expect(fetchPublicImageMock).not.toHaveBeenCalled();
    expect(prisma.teamNewsItem.update).toHaveBeenCalledTimes(1);
  });

  it('keeps imageUrl and links nothing when the download fails', async () => {
    fetchPublicImageMock.mockResolvedValue(null);
    await expect(service.fillImages(['news-0'])).resolves.toBeUndefined();
    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.teamNewsItem.update).toHaveBeenCalledTimes(1);
  });

  it('keeps imageUrl and links nothing when the resize fails', async () => {
    renderMock.mockRejectedValue(new Error('Input buffer contains unsupported image format'));
    await expect(service.fillImages(['news-0'])).resolves.toBeUndefined();
    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
    expect(prisma.teamNewsItem.update).toHaveBeenCalledTimes(1);
  });

  it('links nothing when an upload fails or returns no location', async () => {
    aws.uploadFileToS3.mockResolvedValueOnce({ Location: '' });
    await expect(service.fillImages(['news-0'])).resolves.toBeUndefined();
    expect(prisma.teamNewsItem.update).toHaveBeenCalledTimes(1);

    aws.uploadFileToS3.mockRejectedValueOnce(new Error('AccessDenied'));
    await expect(service.fillImages(['news-0'])).resolves.toBeUndefined();
    expect(prisma.teamNewsItem.update).toHaveBeenCalledTimes(2);
  });

  it('swallows an error when the copy cannot be linked', async () => {
    prisma.teamNewsItem.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('db down'));
    await expect(service.fillImages(['news-0'])).resolves.toBeUndefined();
  });

  it('makes no copy when the image bucket is not set', async () => {
    delete process.env.AWS_S3_IMAGE_BUCKET_NAME;
    await service.fillImages(['news-0']);
    expect(fetchPublicImageMock).not.toHaveBeenCalled();
    expect(aws.uploadFileToS3).not.toHaveBeenCalled();
  });

  describe('fillVariants', () => {
    it('copies only items with an imageUrl and no copy, and counts the stored ones', async () => {
      prisma.teamNewsItem.findMany.mockResolvedValue([
        { uid: 'news-0', imageUrl: 'https://cdn.example.com/0.jpg' },
        { uid: 'news-1', imageUrl: 'https://cdn.example.com/1.jpg' },
      ]);
      fetchPublicImageMock.mockResolvedValueOnce(Buffer.from('a')).mockResolvedValueOnce(null);

      await expect(service.fillVariants(['news-0', 'news-1', 'news-0'])).resolves.toBe(1);

      expect(prisma.teamNewsItem.findMany).toHaveBeenCalledWith({
        where: { uid: { in: ['news-0', 'news-1'] }, imageUrl: { not: null }, imageUid: null },
        select: { uid: true, imageUrl: true },
      });
      expect(fetchOgImageUrlMock).not.toHaveBeenCalled();
      expect(prisma.teamNewsItem.update).toHaveBeenCalledTimes(1);
    });

    it('returns 0 for an empty list or a failed load', async () => {
      await expect(service.fillVariants([])).resolves.toBe(0);
      prisma.teamNewsItem.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.fillVariants(['news-0'])).resolves.toBe(0);
    });
  });
});
