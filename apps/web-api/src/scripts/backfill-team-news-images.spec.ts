jest.mock('../team-news/team-news-image.service', () => ({
  TeamNewsImageService: jest.fn(),
}));

import type { PrismaClient } from '@prisma/client';
import { backfillTeamNewsImages, parseArgs } from './backfill-team-news-images';

type Row = { id: number; uid: string; sourceUrl: string; createdAt: Date; imageCheckedAt: Date | null };

const now = new Date('2026-10-21T00:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

// In-memory stand-in for prisma.teamNewsItem.findMany with the filter the script uses.
const buildPrisma = (rows: Row[]) =>
  ({
    teamNewsItem: {
      findMany: jest.fn(async ({ where, take }) =>
        rows
          .filter(
            (r) =>
              r.imageCheckedAt === null && r.createdAt.getTime() >= where.createdAt.gte.getTime() && r.id > where.id.gt
          )
          .sort((a, b) => a.id - b.id)
          .slice(0, take)
          .map(({ id, uid, sourceUrl }) => ({ id, uid, sourceUrl }))
      ),
    },
  } as unknown as PrismaClient);

describe('backfillTeamNewsImages', () => {
  const makeRows = (): Row[] => [
    { id: 1, uid: 'old', sourceUrl: 'https://x/1', createdAt: daysAgo(40), imageCheckedAt: null },
    { id: 2, uid: 'a', sourceUrl: 'https://x/2', createdAt: daysAgo(5), imageCheckedAt: null },
    { id: 3, uid: 'checked', sourceUrl: 'https://x/3', createdAt: daysAgo(3), imageCheckedAt: daysAgo(3) },
    { id: 4, uid: 'b', sourceUrl: 'https://x/4', createdAt: daysAgo(2), imageCheckedAt: null },
    { id: 5, uid: 'c', sourceUrl: 'https://x/5', createdAt: daysAgo(1), imageCheckedAt: null },
  ];

  it('processes each unchecked recent item once, and a second run does nothing', async () => {
    const rows = makeRows();
    const prisma = buildPrisma(rows);
    const fillImages = jest.fn(async (uids: string[]) => {
      for (const row of rows) if (uids.includes(row.uid)) row.imageCheckedAt = now;
    });

    const first = await backfillTeamNewsImages(prisma, { fillImages }, { days: 30, dryRun: false, batchSize: 2, now });
    expect(first.processed).toBe(3);
    expect(fillImages.mock.calls.flat(2)).toEqual(['a', 'b', 'c']);

    fillImages.mockClear();
    const second = await backfillTeamNewsImages(prisma, { fillImages }, { days: 30, dryRun: false, now });
    expect(second.processed).toBe(0);
    expect(fillImages).not.toHaveBeenCalled();
  });

  it('does not loop on a row whose fill failed', async () => {
    const prisma = buildPrisma(makeRows());
    const fillImages = jest.fn().mockResolvedValue(undefined); // never sets imageCheckedAt

    const result = await backfillTeamNewsImages(prisma, { fillImages }, { days: 30, dryRun: false, batchSize: 2, now });

    expect(result.processed).toBe(3);
  });

  it('fills nothing in a dry run', async () => {
    const prisma = buildPrisma(makeRows());
    const fillImages = jest.fn();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await backfillTeamNewsImages(prisma, { fillImages }, { days: 30, dryRun: true, now });

    expect(result.processed).toBe(3);
    expect(fillImages).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('parseArgs', () => {
  it('defaults to 30 days and no dry run', () => {
    expect(parseArgs([])).toEqual({ days: 30, dryRun: false });
  });

  it('reads --days and --dry-run', () => {
    expect(parseArgs(['--days', '7', '--dry-run'])).toEqual({ days: 7, dryRun: true });
  });

  it('refuses a bad --days value', () => {
    expect(() => parseArgs(['--days', 'abc'])).toThrow('--days must be a positive integer');
  });
});
