import { TeamNewsQueryService } from './team-news-query.service';
import { buildNewsTagVocabulary } from './news-tag-vocabulary.service';

/**
 * LAB-2998: `GET /v1/team-news/tags`, the news tags members can choose. The
 * grouping itself is covered next to the vocabulary; this covers the window and
 * the cache. Route order against `/team-news/:newsItemUid` is covered for every
 * literal GET by team-news.controller.spec.ts.
 */
const vocabulary = buildNewsTagVocabulary([
  { uid: 'fa-ai', title: 'AI', parentUid: null },
  { uid: 'fa-desci', title: 'DeSci', parentUid: null },
]);

function buildService(tagRows: string[][]) {
  const prisma = { teamNewsItem: { findMany: jest.fn(async () => tagRows.map((tags) => ({ tags }))) } };
  const tagVocabulary = { getVocabulary: jest.fn(async () => vocabulary) };
  const service = new TeamNewsQueryService(prisma as any, undefined, tagVocabulary as any);
  return { service, prisma };
}

describe('TeamNewsQueryService.listNewsTags', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it('lists the focus areas news used, and no entry for other tags', async () => {
    const { service } = buildService([['ai', 'launch'], ['desci'], ['$']]);

    await expect(service.listNewsTags(now)).resolves.toEqual([
      { slug: 'ai', title: 'AI', children: [] },
      { slug: 'desci', title: 'DeSci', children: [] },
    ]);
  });

  it('reads only news created in the last 90 days', async () => {
    const { service, prisma } = buildService([]);

    await service.listNewsTags(now);

    const where = (prisma.teamNewsItem.findMany.mock.calls[0] as any)[0].where;
    expect(where.AND[0]).toEqual({ createdAt: { gte: new Date('2026-07-28T12:00:00Z') } });
  });

  it('skips teams the public feed excludes', async () => {
    const { service, prisma } = buildService([]);

    await service.listNewsTags(now);

    const where = (prisma.teamNewsItem.findMany.mock.calls[0] as any)[0].where;
    expect(where.AND[1]).toHaveProperty('NOT');
  });

  it('serves repeat requests within ten minutes from the cache', async () => {
    const { service, prisma } = buildService([['ai']]);

    await service.listNewsTags(now);
    await service.listNewsTags(new Date(now.getTime() + 9 * 60 * 1000));
    expect(prisma.teamNewsItem.findMany).toHaveBeenCalledTimes(1);

    await service.listNewsTags(new Date(now.getTime() + 11 * 60 * 1000));
    expect(prisma.teamNewsItem.findMany).toHaveBeenCalledTimes(2);
  });
});
