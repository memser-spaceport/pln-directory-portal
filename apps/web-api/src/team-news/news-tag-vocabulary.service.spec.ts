import { buildNewsTagVocabulary, groupUsedNewsTags, NewsTagVocabularyService } from './news-tag-vocabulary.service';

/**
 * LAB-2998: news tags are focus-area slugs, so the vocabulary is the focus-area
 * table slugified with the same helper the producer's tags match (checked on dev
 * data: 25 of 49 distinct tags on recent news are exactly these slugs).
 */
const areas = [
  { uid: 'fa-dhr', title: 'Digital Human Rights', parentUid: null },
  { uid: 'fa-do', title: 'Data Ownership', parentUid: 'fa-dhr' },
  { uid: 'fa-air', title: 'AI & Robotics', parentUid: null },
  { uid: 'fa-climate', title: 'Climate / ReFi', parentUid: null },
  { uid: 'fa-ai', title: 'AI', parentUid: 'fa-air' },
];

describe('buildNewsTagVocabulary', () => {
  const vocabulary = buildNewsTagVocabulary(areas);

  it.each([
    ['AI & Robotics', 'ai-robotics'],
    ['Climate / ReFi', 'climate-refi'],
    ['Digital Human Rights', 'digital-human-rights'],
  ])('slugs %s as the news tag %s', (title, slug) => {
    expect(vocabulary.get(slug)?.title).toBe(title);
  });

  it('links a child focus area to its parent by slug', () => {
    expect(vocabulary.get('data-ownership')).toEqual({
      slug: 'data-ownership',
      title: 'Data Ownership',
      parentSlug: 'digital-human-rights',
    });
    expect(vocabulary.get('digital-human-rights')?.parentSlug).toBeNull();
  });

  it('keeps the first of two titles that slugify the same, and reports it', () => {
    const onCollision = jest.fn();
    const v = buildNewsTagVocabulary(
      [
        { uid: 'a', title: 'AI & Robotics', parentUid: null },
        { uid: 'b', title: 'AI Robotics', parentUid: null },
      ],
      onCollision
    );
    expect(v.get('ai-robotics')?.title).toBe('AI & Robotics');
    expect(onCollision).toHaveBeenCalledWith('ai-robotics', 'AI & Robotics', 'AI Robotics');
  });
});

describe('NewsTagVocabularyService', () => {
  function buildPrisma(teamAreaTitles: string[] = []) {
    return {
      focusArea: { findMany: jest.fn(async () => areas) },
      teamFocusArea: {
        findMany: jest.fn(async () => teamAreaTitles.map((title) => ({ focusArea: { title } }))),
      },
    };
  }

  it('loads the focus areas once and serves later calls from the cache', async () => {
    const prisma = buildPrisma();
    const service = new NewsTagVocabularyService(prisma as any);

    await service.getVocabulary();
    await service.getVocabulary();

    expect(prisma.focusArea.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failed load in the cache', async () => {
    const prisma = buildPrisma();
    prisma.focusArea.findMany.mockRejectedValueOnce(new Error('db down'));
    const service = new NewsTagVocabularyService(prisma as any);

    await expect(service.getVocabulary()).rejects.toThrow('db down');
    await expect(service.getVocabulary()).resolves.toBeDefined();
    expect(prisma.focusArea.findMany).toHaveBeenCalledTimes(2);
  });

  it("seeds a member's tags from their teams' focus areas, deduplicated", async () => {
    const prisma = buildPrisma(['AI', 'Data Ownership', 'AI']);
    const service = new NewsTagVocabularyService(prisma as any);

    await expect(service.seedTagsForMember('m1')).resolves.toEqual(['ai', 'data-ownership']);
    expect(prisma.teamFocusArea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { team: { teamMemberRoles: { some: { memberUid: 'm1' } } } } })
    );
  });

  it('seeds nothing for a member on no team', async () => {
    const service = new NewsTagVocabularyService(buildPrisma([]) as any);

    await expect(service.seedTagsForMember('m1')).resolves.toEqual([]);
  });
});

describe('groupUsedNewsTags', () => {
  const vocabulary = buildNewsTagVocabulary(areas);

  it('lists focus areas used by news and drops tags that are not focus areas', () => {
    expect(groupUsedNewsTags(['ai-robotics', 'launch', '$', 'longevity'], vocabulary)).toEqual([
      { slug: 'ai-robotics', title: 'AI & Robotics', children: [] },
    ]);
  });

  it('lists a used child under its parent, adding the parent even when only the child was used', () => {
    expect(groupUsedNewsTags(['data-ownership'], vocabulary)).toEqual([
      {
        slug: 'digital-human-rights',
        title: 'Digital Human Rights',
        children: [{ slug: 'data-ownership', title: 'Data Ownership' }],
      },
    ]);
  });

  it('sorts groups and children by title, without duplicates', () => {
    const groups = groupUsedNewsTags(['climate-refi', 'ai', 'ai-robotics', 'ai', 'data-ownership'], vocabulary);
    expect(groups.map((g) => g.title)).toEqual(['AI & Robotics', 'Climate / ReFi', 'Digital Human Rights']);
    expect(groups[0].children).toEqual([{ slug: 'ai', title: 'AI' }]);
  });

  it('returns an empty list when no news used a focus area', () => {
    expect(groupUsedNewsTags(['launch'], vocabulary)).toEqual([]);
  });
});
