import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { buildNewsTagVocabulary } from './news-tag-vocabulary.service';
import { DigestLinkError, issueDigestLinkToken } from './labos-digest-link-token.util';
import { LabosDigestPageService } from './labos-digest-page.service';
import { LabosDigestPublicController } from './labos-digest-public.controller';
import { digestTopics } from './labos-digest-topics.util';

/** LAB-3263: the public digest page read, and the guards in front of More / Less. */
const item = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  title: `Title ${uid}`,
  summary: null,
  contentHtml: `<p>${uid}</p>`,
  imageUrl: null,
  sourceUrl: `https://src/${uid}`,
  sourceDomain: 'src',
  eventType: 'LAUNCH',
  tags: ['ai'],
  team: { uid: `team-${uid}`, name: `Team ${uid}` },
  image: null,
  ...extra,
});

function build(
  opts: {
    member?: { name: string; preferences?: unknown } | null;
    items?: unknown[];
    choices?: unknown[];
    follows?: string[];
    comments?: Record<string, number>;
    activeRoles?: number;
    seeds?: string[];
    scores?: Record<string, number>;
    choosable?: { slug: string; title: string; children: { slug: string; title: string }[] }[];
  } = {}
) {
  const prisma = {
    member: { findUnique: jest.fn(async () => (opts.member === undefined ? { name: 'Ada Lovelace' } : opts.member)) },
    teamNewsItem: {
      findMany: jest.fn(async () => opts.items ?? []),
      findUnique: jest.fn(async () => ({ tags: ['ai'] })),
    },
    labosDigestChoice: { findMany: jest.fn(async () => opts.choices ?? []) },
    follow: { findMany: jest.fn(async () => (opts.follows ?? []).map((entityUid) => ({ entityUid }))) },
    feedComment: {
      groupBy: jest.fn(async () =>
        Object.entries(opts.comments ?? {}).map(([newsItemUid, all]) => ({ newsItemUid, _count: { _all: all } }))
      ),
    },
    teamMemberRole: { count: jest.fn(async () => opts.activeRoles ?? 0) },
    memberInterestProfileEntry: {
      findMany: jest.fn(async () => Object.entries(opts.scores ?? {}).map(([key, score]) => ({ key, score }))),
    },
    $transaction: jest.fn(),
  };
  const vocabulary = {
    getVocabulary: jest.fn(async () =>
      buildNewsTagVocabulary([
        { uid: 'fa-ai', title: 'AI', parentUid: null },
        { uid: 'fa-llm', title: 'LLMs', parentUid: 'fa-ai' },
        { uid: 'fa-defi', title: 'DeFi', parentUid: null },
        { uid: 'fa-desci', title: 'DeSci', parentUid: null },
      ])
    ),
    seedTagsForMember: jest.fn(async () => opts.seeds ?? []),
  };
  const newsQuery = {
    listNewsTags: jest.fn(
      async () =>
        opts.choosable ?? [
          { slug: 'ai', title: 'AI', children: [{ slug: 'llms', title: 'LLMs' }] },
          { slug: 'defi', title: 'DeFi', children: [] },
          { slug: 'desci', title: 'DeSci', children: [] },
        ]
    ),
  };
  const forum = { read: jest.fn(async () => ({ posts: [], unavailable: false })) };
  const cache = { reset: jest.fn() };
  const service = new LabosDigestPageService(
    prisma as any,
    vocabulary as any,
    forum as any,
    cache as any,
    newsQuery as any
  );
  return { service, prisma, forum, vocabulary };
}

const token = (extra: Record<string, unknown> = {}) =>
  issueDigestLinkToken({
    m: 'm1',
    f: 'weekly',
    s: '2026-11-16T09:00:00.000Z',
    n: ['b', 'a', 'gone'],
    l: 'b',
    p: [101],
    ...extra,
  } as any);

describe('LabosDigestPageService', () => {
  const env = { ...process.env };
  beforeEach(() => (process.env.DIGEST_LINK_SECRET = 'page-test-secret'));
  afterEach(() => (process.env = { ...env }));

  describe('read', () => {
    it('returns the stories in link order, skipping a deleted one, with the active choice', async () => {
      const { service, forum } = build({
        items: [item('a'), item('b')],
        choices: [{ newsItemUid: 'a', choice: 'LESS' }],
      });

      const page = await service.read(token());

      expect(page.stories.map((s) => [s.uid, s.position, s.isTopStory, s.choice])).toEqual([
        ['b', 0, true, null],
        ['a', 1, false, 'less'],
      ]);
      expect(page).toMatchObject({ frequency: 'weekly', firstName: 'Ada', forumPosts: [], forumUnavailable: false });
      expect(forum.read).toHaveBeenCalledWith([101]);
    });

    it('adds the team header, sources, comment counts, team membership and next send (LAB-3288)', async () => {
      const { service, prisma } = build({
        items: [
          item('a', {
            sourceUrls: ['https://www.src/a/', 'https://press.example/a', ' '],
            team: { uid: 'team-a', name: 'Team a', logo: { url: 'https://img/a.png' } },
          }),
          item('b'),
        ],
        follows: ['team-a'],
        comments: { a: 3 },
        activeRoles: 1,
      });

      const page = await service.read(token());

      const a = page.stories.find((s) => s.uid === 'a');
      const b = page.stories.find((s) => s.uid === 'b');
      expect(a).toMatchObject({
        teamLogoUrl: 'https://img/a.png',
        followsTeam: true,
        commentCount: 3,
        sources: [
          { url: 'https://src/a', domain: 'src' },
          { url: 'https://press.example/a', domain: 'press.example' },
        ],
      });
      expect(b).toMatchObject({
        teamLogoUrl: null,
        followsTeam: false,
        commentCount: 0,
        sources: [{ url: 'https://src/b', domain: 'src' }],
      });
      expect(page.isTeamMember).toBe(true);
      expect(new Date(page.nextSendAt).getTime()).toBeGreaterThan(Date.now());
      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { memberUid: 'm1', entityType: 'TEAM' } })
      );
    });

    it('is not a team member without an active role', async () => {
      const { service } = build({ items: [item('a')] });
      expect((await service.read(token())).isTeamMember).toBe(false);
    });

    it('returns saved topics and suggests the rest by interest weight (LAB-3289)', async () => {
      const { service, vocabulary } = build({
        member: { name: 'Ada', preferences: { newsTags: ['defi', 'not-a-tag'] } },
        scores: { desci: 2, llms: 5, ai: -1 },
      });
      const { topics } = await service.read(token());
      expect(topics.followed).toEqual([{ slug: 'defi', title: 'DeFi' }]);
      expect(topics.suggested.map((t) => t.slug)).toEqual(['llms', 'desci', 'ai']);
      expect(vocabulary.seedTagsForMember).not.toHaveBeenCalled();
    });

    it('follows the starting tags when nothing is saved, and never suggests what a followed parent covers', async () => {
      const { service, vocabulary } = build({ member: { name: 'Ada', preferences: { newsTags: [] } }, seeds: ['ai'] });
      const { topics } = await service.read(token());
      expect(vocabulary.seedTagsForMember).toHaveBeenCalledWith('m1');
      expect(topics.followed).toEqual([{ slug: 'ai', title: 'AI' }]);
      expect(topics.suggested.map((t) => t.slug)).toEqual(['defi', 'desci']);
    });

    it('is not found for a member who no longer exists', async () => {
      const { service } = build({ member: null });
      await expect(service.read(token())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('changes nothing: five reads never write', async () => {
      const { service, prisma } = build({ items: [item('a')] });
      for (let i = 0; i < 5; i++) await service.read(token());
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(Object.keys(prisma.labosDigestChoice)).toEqual(['findMany']);
    });

    it('passes on forumUnavailable and still returns the stories', async () => {
      const { service, forum } = build({ items: [item('a')] });
      forum.read.mockResolvedValueOnce({ posts: [], unavailable: true });
      await expect(service.read(token())).resolves.toMatchObject({ forumUnavailable: true, forumPosts: [] });
    });
  });

  describe('choose', () => {
    it('refuses a story that is not in the link', async () => {
      const { service, prisma } = build();
      await expect(service.choose(token(), 'other', 'more')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a bad token before touching the database', async () => {
      const { service, prisma } = build();
      await expect(service.choose(`${token()}x`, 'a', 'more')).rejects.toBeInstanceOf(DigestLinkError);
      expect(prisma.teamNewsItem.findUnique).not.toHaveBeenCalled();
    });
  });
});

describe('LabosDigestPublicController', () => {
  const env = { ...process.env };
  afterEach(() => (process.env = { ...env }));

  it('has no auth guard: the link names the member, never the session', () => {
    expect(Reflect.getMetadata('__guards__', LabosDigestPublicController)).toBeUndefined();
    for (const method of ['read', 'choose']) {
      expect(Reflect.getMetadata('__guards__', LabosDigestPublicController.prototype[method])).toBeUndefined();
      expect(LabosDigestPublicController.prototype[method].length).toBe(1);
    }
  });

  it('answers a broken link with 401 and its reason', async () => {
    process.env.DIGEST_LINK_SECRET = 's';
    const controller = new LabosDigestPublicController(build().service);
    const error = await controller.read({ token: 'v1.nope.nope' }).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ reason: 'signature' });
  });

  it('answers an expired link with reason expired', async () => {
    process.env.DIGEST_LINK_SECRET = 's';
    const old = issueDigestLinkToken(
      { m: 'm1', f: 'daily', s: '2026-01-01T00:00:00.000Z', n: ['a'], l: 'a', p: [] },
      Date.now() - 91 * 24 * 3600 * 1000
    );
    const error = await new LabosDigestPublicController(build().service).read({ token: old }).catch((e) => e);
    expect(error.getResponse()).toMatchObject({ reason: 'expired' });
  });

  it('answers 503 when the environment has no link secret', async () => {
    delete process.env.DIGEST_LINK_SECRET;
    const error = await new LabosDigestPublicController(build().service).read({ token: 'v1.a.b' }).catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects a body without a token or with an unknown choice', async () => {
    const controller = new LabosDigestPublicController(build().service);
    await expect(controller.read({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.choose({ token: 't', newsItemUid: 'a', choice: 'love' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

describe('digestTopics (LAB-3289)', () => {
  const vocabulary = buildNewsTagVocabulary([
    { uid: 'a', title: 'Beta', parentUid: null },
    { uid: 'b', title: 'Alpha', parentUid: null },
  ]);
  const choosable = [
    { slug: 'beta', title: 'Beta', children: [] },
    { slug: 'alpha', title: 'Alpha', children: [] },
  ];

  it('orders unweighted suggestions by title', () => {
    expect(digestTopics([], choosable, vocabulary, new Map()).suggested.map((t) => t.slug)).toEqual(['alpha', 'beta']);
  });

  it('suggests nothing when every choosable tag is followed', () => {
    expect(digestTopics(['alpha', 'beta'], choosable, vocabulary, new Map()).suggested).toEqual([]);
  });
});
