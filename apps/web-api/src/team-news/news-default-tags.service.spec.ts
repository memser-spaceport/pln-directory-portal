jest.mock('ai', () => ({
  generateText: jest.fn(),
}));
jest.mock('@ai-sdk/openai', () => ({ openai: { responses: jest.fn() } }));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));
// Only an injection token here; its own imports are not needed.
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: class AnalyticsService {} }));

import { Prisma } from '@prisma/client';
import { generateText } from 'ai';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { AiProviderService } from '../shared/ai-provider.service';
import { PrismaService } from '../shared/prisma.service';
import {
  buildTagInput,
  hashTagInput,
  isNewsDefaultTagsJobEnabled,
  NewsDefaultTagsService,
  parseSuggestedTags,
  planGeneration,
  TagInputMember,
} from './news-default-tags.service';
import { buildNewsTagVocabulary, NewsTagVocabularyService, StartingTags } from './news-tag-vocabulary.service';

const vocabulary = buildNewsTagVocabulary(
  ['AI', 'Cryptography', 'DeSci', 'DeFi', 'Neurotech', 'Robotics', 'Public Goods'].map((title, i) => ({
    uid: `fa-${i}`,
    title,
    parentUid: null,
  }))
);

const emptyMember: TagInputMember = {
  bio: null,
  ohInterest: [],
  ohHelpWith: [],
  skills: [],
  teamMemberRoles: [],
  projectContributions: [],
};

describe('parseSuggestedTags', () => {
  it('reads the tags of a bare JSON object, in order', () => {
    expect(parseSuggestedTags('{"tags":["desci","ai"]}', vocabulary, 6)).toEqual(['desci', 'ai']);
  });

  it('reads an object inside a json code fence', () => {
    expect(parseSuggestedTags('```json\n{"tags":["ai"]}\n```', vocabulary, 6)).toEqual(['ai']);
  });

  it('drops slugs that are not news tags, non-strings and repeats', () => {
    expect(parseSuggestedTags('{"tags":["ai","not-a-tag",7,"ai","defi"]}', vocabulary, 6)).toEqual(['ai', 'defi']);
  });

  it('keeps at most the limit', () => {
    expect(parseSuggestedTags('{"tags":["ai","defi","desci"]}', vocabulary, 2)).toEqual(['ai', 'defi']);
  });

  it.each(['', 'no json here', '{"tags":"ai"}', '{broken', '["ai"]'])('gives no tags for %p', (reply) => {
    expect(parseSuggestedTags(reply, vocabulary, 6)).toEqual([]);
  });
});

describe('buildTagInput', () => {
  it('is null when the member has nothing to read', () => {
    expect(buildTagInput(emptyMember)).toBeNull();
    expect(buildTagInput({ ...emptyMember, bio: ' <p> </p> ', ohInterest: [' '] })).toBeNull();
  });

  it('lists bio as plain text, skills, office hours topics, teams and projects', () => {
    const input = buildTagInput({
      bio: '<p>Builds <b>ZK</b> provers</p>',
      ohInterest: ['proof systems'],
      ohHelpWith: ['audits'],
      skills: [{ title: 'Engineering' }],
      teamMemberRoles: [
        {
          role: 'CTO',
          team: {
            name: 'Prover Labs',
            shortDescription: 'Zero-knowledge tooling',
            teamFocusAreas: [{ focusArea: { title: 'Cryptography' } }],
          },
        },
        { role: null, team: { name: 'Side Project', shortDescription: null, teamFocusAreas: [] } },
      ],
      projectContributions: [{ project: { name: 'zkVM', tagline: 'A fast prover' } }, { project: null }],
    });
    expect(input).toBe(
      [
        'Bio: Builds ZK provers',
        'Skills: Engineering',
        'Wants to talk about: proof systems',
        'Can help with: audits',
        'Teams: CTO at Prover Labs - Zero-knowledge tooling - focus areas: Cryptography; Side Project',
        'Projects: zkVM - A fast prover',
      ].join('\n')
    );
  });

  it('cuts a long bio to 2000 characters', () => {
    expect(buildTagInput({ ...emptyMember, bio: 'a'.repeat(5000) })).toBe(`Bio: ${'a'.repeat(2000)}`);
  });
});

describe('planGeneration', () => {
  const base = { hasChosenTags: false, hasProfileTopics: false, inputHash: 'h1', row: null };
  const row = { inputHash: 'h1', generatedAt: new Date(), failedAttempts: 0 };

  it.each([
    ['a member with saved tags', { ...base, hasChosenTags: true }, 'skip-member-set'],
    ['a member with profile topics', { ...base, hasProfileTopics: true }, 'skip-interest-profile'],
    ['a member with nothing to read', { ...base, inputHash: null }, 'skip-no-input'],
    ['a member with no row', base, 'generate'],
    [
      'a row with no generation yet',
      { ...base, row: { inputHash: null, generatedAt: null, failedAttempts: 0 } },
      'generate',
    ],
    ['unchanged data', { ...base, row }, 'skip-unchanged'],
    ['changed data', { ...base, inputHash: 'h2', row }, 'generate'],
    [
      'a failed attempt on the same data',
      { ...base, row: { ...row, generatedAt: null, failedAttempts: 1 } },
      'generate',
    ],
    ['three failed attempts on the same data', { ...base, row: { ...row, failedAttempts: 3 } }, 'skip-gave-up'],
    [
      'three failed attempts, then changed data',
      { ...base, inputHash: 'h2', row: { ...row, failedAttempts: 3 } },
      'generate',
    ],
  ])('%s → %s', (_name, input, plan) => {
    expect(planGeneration(input)).toBe(plan);
  });
});

describe('isNewsDefaultTagsJobEnabled', () => {
  it.each([
    [{}, false],
    [{ NEWS_DEFAULT_TAGS_JOB_ENABLED: 'false' }, false],
    [{ NEWS_DEFAULT_TAGS_JOB_ENABLED: ' TRUE ' }, true],
  ])('%p → %p', (env, enabled) => {
    expect(isNewsDefaultTagsJobEnabled(env as NodeJS.ProcessEnv)).toBe(enabled);
  });
});

describe('NewsDefaultTagsService', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const flag = process.env.NEWS_PROFILE_STARTING_TAGS_ENABLED;

  function setup({
    member = { preferences: null, newsTagSuggestion: null } as {
      preferences: unknown;
      newsTagSuggestion: { approvedAt: Date | null; generatedAt: Date | null } | null;
    } | null,
    starting = { tags: [], source: 'team' } as StartingTags,
    candidates = [] as any[],
    profileTopics = [] as { memberUid: string; key: string }[],
  } = {}) {
    const prisma = {
      member: {
        findUnique: jest.fn().mockResolvedValue(member),
        findMany: jest.fn().mockResolvedValue(candidates),
      },
      memberNewsTagSuggestion: {
        upsert: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      memberInterestProfileEntry: { findMany: jest.fn().mockResolvedValue(profileTopics) },
    };
    const tagVocabulary = {
      getVocabulary: jest.fn().mockResolvedValue(vocabulary),
      startingTagsForMembers: jest.fn(async (uids: string[]) => new Map(uids.map((uid) => [uid, starting]))),
    };
    const aiProvider = {
      getResponsesModel: jest.fn().mockReturnValue('model-handle'),
      getModelName: jest.fn().mockReturnValue('test-model'),
    };
    const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
    const service = new NewsDefaultTagsService(
      prisma as unknown as PrismaService,
      aiProvider as unknown as AiProviderService,
      tagVocabulary as unknown as NewsTagVocabularyService,
      analytics as unknown as AnalyticsService
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    return { service, prisma, tagVocabulary, aiProvider, analytics };
  }

  beforeEach(() => {
    (generateText as jest.Mock).mockReset();
    delete process.env.NEWS_PROFILE_STARTING_TAGS_ENABLED;
  });

  afterAll(() => {
    if (flag === undefined) delete process.env.NEWS_PROFILE_STARTING_TAGS_ENABLED;
    else process.env.NEWS_PROFILE_STARTING_TAGS_ENABLED = flag;
  });

  describe('getDefaultTags', () => {
    it('returns a saved list as member-set and approved, without reading starting tags', async () => {
      const { service, tagVocabulary } = setup({
        member: { preferences: { newsTags: ['ai', 'desci'] }, newsTagSuggestion: null },
      });
      await expect(service.getDefaultTags('m1')).resolves.toEqual({
        tags: [
          { slug: 'ai', title: 'AI' },
          { slug: 'desci', title: 'DeSci' },
        ],
        source: 'member-set',
        approved: true,
        approvedAt: null,
        generatedAt: null,
      });
      expect(tagVocabulary.startingTagsForMembers).not.toHaveBeenCalled();
    });

    it('returns stored AI tags with their generation time, not approved', async () => {
      const generatedAt = new Date('2026-11-10T08:00:00Z');
      const { service } = setup({
        member: { preferences: null, newsTagSuggestion: { approvedAt: null, generatedAt } },
        starting: { tags: ['ai', 'desci'], source: 'ai' },
      });
      await expect(service.getDefaultTags('m1')).resolves.toEqual({
        tags: [
          { slug: 'ai', title: 'AI' },
          { slug: 'desci', title: 'DeSci' },
        ],
        source: 'ai',
        approved: false,
        approvedAt: null,
        generatedAt: generatedAt.toISOString(),
      });
      expect(generateText).not.toHaveBeenCalled();
    });

    it.each(['interest-profile', 'team'] as const)(
      'returns %s tags as approved once the member answered',
      async (source) => {
        const approvedAt = new Date('2026-11-12T09:00:00Z');
        const { service } = setup({
          member: { preferences: { newsTags: [] }, newsTagSuggestion: { approvedAt, generatedAt: new Date() } },
          starting: { tags: ['defi'], source },
        });
        await expect(service.getDefaultTags('m1')).resolves.toEqual({
          tags: [{ slug: 'defi', title: 'DeFi' }],
          source,
          approved: true,
          approvedAt: approvedAt.toISOString(),
          generatedAt: null,
        });
      }
    );

    it('returns no tags for a member with no source', async () => {
      const { service } = setup();
      await expect(service.getDefaultTags('m1')).resolves.toMatchObject({ tags: [], source: 'team', approved: false });
    });
  });

  describe('answer', () => {
    it('approves the shown tags: sets approvedAt, saves no tags, records the approval', async () => {
      const { service, prisma, analytics } = setup({ starting: { tags: ['ai', 'desci'], source: 'ai' } });
      const saveTags = jest.fn();

      await service.answer('m1', undefined, saveTags, now);

      expect(saveTags).not.toHaveBeenCalled();
      expect(prisma.memberNewsTagSuggestion.upsert).toHaveBeenCalledWith({
        where: { memberUid: 'm1' },
        create: { memberUid: 'm1', approvedAt: now },
        update: { approvedAt: now },
      });
      expect(analytics.trackEvent).toHaveBeenCalledWith({
        name: 'team-news-default-tags-approved',
        distinctId: 'm1',
        properties: { memberUid: 'm1', sourceBefore: 'ai', shownCount: 2, savedCount: 2, firstAnswer: true },
      });
    });

    it('replaces the tags through the preferences save and records the replacement', async () => {
      const { service, prisma, analytics } = setup({ starting: { tags: ['ai', 'desci'], source: 'team' } });
      const saveTags = jest.fn().mockResolvedValue(undefined);

      await service.answer('m1', ['ai'], saveTags, now);

      expect(saveTags).toHaveBeenCalledWith(['ai']);
      expect(prisma.memberNewsTagSuggestion.upsert).toHaveBeenCalledTimes(1);
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'team-news-default-tags-replaced',
          properties: expect.objectContaining({ sourceBefore: 'team', shownCount: 2, savedCount: 1 }),
        })
      );
    });

    it('stores nothing when the save rejects the tags', async () => {
      const { service, prisma, analytics } = setup();
      const saveTags = jest.fn().mockRejectedValue(new Error('Unknown news tags: nope'));

      await expect(service.answer('m1', ['nope'], saveTags, now)).rejects.toThrow('Unknown news tags');
      expect(prisma.memberNewsTagSuggestion.upsert).not.toHaveBeenCalled();
      expect(analytics.trackEvent).not.toHaveBeenCalled();
    });

    it('keeps the first approvedAt on a second answer', async () => {
      const { service, prisma, analytics } = setup({
        member: { preferences: null, newsTagSuggestion: { approvedAt: new Date('2026-11-01'), generatedAt: null } },
      });

      await service.answer('m1', undefined, jest.fn(), now);

      expect(prisma.memberNewsTagSuggestion.upsert).not.toHaveBeenCalled();
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ properties: expect.objectContaining({ firstAnswer: false }) })
      );
    });
  });

  describe('runGeneration', () => {
    const candidate = (uid: string, overrides: Record<string, unknown> = {}) => ({
      ...emptyMember,
      uid,
      preferences: null,
      bio: `Bio of ${uid}`,
      newsTagSuggestion: null,
      ...overrides,
    });
    const reply = (tags: string[]) => ({ text: JSON.stringify({ tags }) });

    it('asks for members that are due: no row, never looked at, 7 days old, or a failed attempt a day old', async () => {
      const { service, prisma } = setup();
      await service.runGeneration(now);

      const args = prisma.member.findMany.mock.calls[0][0];
      expect(args.take).toBe(200);
      expect(args.where.deletedAt).toBeNull();
      expect(args.where.NOT).toBeDefined();
      expect(args.where.OR).toEqual([
        { newsTagSuggestion: { is: null } },
        {
          newsTagSuggestion: {
            is: {
              OR: [
                { lastAttemptAt: null },
                { lastAttemptAt: { lt: new Date('2026-11-06T12:00:00Z') } },
                { failedAttempts: { gte: 1, lt: 3 }, lastAttemptAt: { lt: new Date('2026-11-12T12:00:00Z') } },
              ],
            },
          },
        },
      ]);
    });

    it('stores the valid tags of a new member and records the generation', async () => {
      (generateText as jest.Mock).mockResolvedValue(reply(['cryptography', 'ai', 'not-a-tag', 'defi']));
      const { service, prisma, analytics, aiProvider } = setup({ candidates: [candidate('m1')] });

      const result = await service.runGeneration(now);

      expect(result).toEqual({ candidates: 1, generated: 1, failed: 0, skipped: 0 });
      expect(prisma.memberNewsTagSuggestion.create).toHaveBeenCalledWith({
        data: { memberUid: 'm1', lastAttemptAt: now },
      });
      expect(prisma.memberNewsTagSuggestion.update).toHaveBeenCalledWith({
        where: { memberUid: 'm1' },
        data: {
          tags: ['cryptography', 'ai', 'defi'],
          inputHash: hashTagInput('Bio: Bio of m1'),
          model: 'test-model',
          generatedAt: now,
          failedAttempts: 0,
        },
      });
      expect(aiProvider.getResponsesModel).toHaveBeenCalledWith('NEWS_DEFAULT_TAGS_AI_PROVIDER', {
        useSearchGrounding: false,
      });
      const call = (generateText as jest.Mock).mock.calls[0][0];
      expect(call.prompt).toContain('cryptography: Cryptography');
      expect(call.prompt).toContain('Bio: Bio of m1');
      expect(call.abortSignal).toBeInstanceOf(AbortSignal);
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'team-news-default-tags-generated',
          distinctId: 'system:news-default-tags',
          properties: expect.objectContaining({
            memberUid: 'm1',
            tagsCount: 3,
            model: 'test-model',
            trigger: 'created',
          }),
        })
      );
    });

    it('keeps at most 6 tags', async () => {
      (generateText as jest.Mock).mockResolvedValue(
        reply(['ai', 'cryptography', 'desci', 'defi', 'neurotech', 'robotics', 'public-goods'])
      );
      const { service, prisma } = setup({ candidates: [candidate('m1')] });
      await service.runGeneration(now);
      expect(prisma.memberNewsTagSuggestion.update.mock.calls[0][0].data.tags).toHaveLength(6);
    });

    it.each([
      [
        'fewer than 3 valid tags',
        () => (generateText as jest.Mock).mockResolvedValue(reply(['ai', 'defi'])),
        'too-few-tags',
        2,
      ],
      ['a failed call', () => (generateText as jest.Mock).mockRejectedValue(new Error('timeout')), 'model-error', 0],
    ])('keeps the old tags and counts a failure on %s', async (_name, arrange, reason, validTagsCount) => {
      arrange();
      const input = 'Bio: Bio of m1';
      const row = {
        inputHash: 'old-hash',
        generatedAt: new Date('2026-10-01'),
        failedAttempts: 0,
        lastAttemptAt: new Date('2026-10-01'),
      };
      const { service, prisma, analytics } = setup({ candidates: [candidate('m1', { newsTagSuggestion: row })] });

      const result = await service.runGeneration(now);

      expect(result).toMatchObject({ generated: 0, failed: 1 });
      expect(prisma.memberNewsTagSuggestion.update).toHaveBeenCalledWith({
        where: { memberUid: 'm1' },
        data: { inputHash: hashTagInput(input), failedAttempts: 1 },
      });
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'team-news-default-tags-generation-failed',
          properties: expect.objectContaining({ memberUid: 'm1', reason, validTagsCount, failedAttempts: 1 }),
        })
      );
    });

    it('counts a second failure on the same data', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('timeout'));
      const row = {
        inputHash: hashTagInput('Bio: Bio of m1'),
        generatedAt: null,
        failedAttempts: 1,
        lastAttemptAt: new Date('2026-11-11'),
      };
      const { service, prisma } = setup({ candidates: [candidate('m1', { newsTagSuggestion: row })] });
      await service.runGeneration(now);
      expect(prisma.memberNewsTagSuggestion.update.mock.calls[0][0].data.failedAttempts).toBe(2);
    });

    it('refreshes a member whose data changed, and marks it as refreshed', async () => {
      (generateText as jest.Mock).mockResolvedValue(reply(['ai', 'desci', 'defi']));
      const lastAttemptAt = new Date('2026-11-01');
      const row = { inputHash: 'old-hash', generatedAt: lastAttemptAt, failedAttempts: 0, lastAttemptAt };
      const { service, prisma, analytics } = setup({ candidates: [candidate('m1', { newsTagSuggestion: row })] });

      await service.runGeneration(now);

      expect(prisma.memberNewsTagSuggestion.updateMany).toHaveBeenCalledWith({
        where: { memberUid: 'm1', lastAttemptAt },
        data: { lastAttemptAt: now },
      });
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({ properties: expect.objectContaining({ trigger: 'refreshed' }) })
      );
    });

    it('makes no model call for unchanged data, saved tags or nothing to read, and still claims them', async () => {
      const unchanged = {
        inputHash: hashTagInput('Bio: Bio of m1'),
        generatedAt: new Date('2026-11-01'),
        failedAttempts: 0,
        lastAttemptAt: new Date('2026-11-01'),
      };
      const { service, prisma } = setup({
        candidates: [
          candidate('m1', { newsTagSuggestion: unchanged }),
          candidate('m2', { preferences: { newsTags: ['ai'] } }),
          candidate('m3', { bio: null }),
        ],
      });

      const result = await service.runGeneration(now);

      expect(result).toEqual({ candidates: 3, generated: 0, failed: 0, skipped: 3 });
      expect(generateText).not.toHaveBeenCalled();
      expect(prisma.memberNewsTagSuggestion.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.memberNewsTagSuggestion.create).toHaveBeenCalledTimes(2);
      expect(prisma.memberNewsTagSuggestion.update).not.toHaveBeenCalled();
    });

    it('leaves a member another instance claimed', async () => {
      const { service, prisma } = setup({ candidates: [candidate('m1'), candidate('m2')] });
      (generateText as jest.Mock).mockResolvedValue(reply(['ai', 'desci', 'defi']));
      prisma.memberNewsTagSuggestion.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', 'P2002', 'test')
      );

      const result = await service.runGeneration(now);

      expect(result).toMatchObject({ generated: 1 });
      expect(generateText).toHaveBeenCalledTimes(1);
      expect(prisma.memberNewsTagSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { memberUid: 'm2' } })
      );
    });

    it('makes at most 50 model calls and leaves the rest unclaimed for the next run', async () => {
      (generateText as jest.Mock).mockResolvedValue(reply(['ai', 'desci', 'defi']));
      const { service, prisma } = setup({ candidates: Array.from({ length: 60 }, (_, i) => candidate(`m${i}`)) });

      const result = await service.runGeneration(now);

      expect(result).toEqual({ candidates: 60, generated: 50, failed: 0, skipped: 0 });
      expect(generateText).toHaveBeenCalledTimes(50);
      expect(prisma.memberNewsTagSuggestion.create).toHaveBeenCalledTimes(50);
    });

    it('does not query the interest profile while profile starting tags are off', async () => {
      (generateText as jest.Mock).mockResolvedValue(reply(['ai', 'desci', 'defi']));
      const { service, prisma } = setup({ candidates: [candidate('m1')] });
      await service.runGeneration(now);
      expect(prisma.memberInterestProfileEntry.findMany).not.toHaveBeenCalled();
    });

    it('skips a member with a usable profile topic when profile starting tags are on', async () => {
      process.env.NEWS_PROFILE_STARTING_TAGS_ENABLED = 'true';
      (generateText as jest.Mock).mockResolvedValue(reply(['ai', 'desci', 'defi']));
      const { service } = setup({
        candidates: [candidate('m1'), candidate('m2')],
        profileTopics: [
          { memberUid: 'm1', key: 'ai' },
          { memberUid: 'm2', key: 'not-a-tag' },
        ],
      });

      const result = await service.runGeneration(now);

      expect(result).toEqual({ candidates: 2, generated: 1, failed: 0, skipped: 1 });
    });
  });
});
