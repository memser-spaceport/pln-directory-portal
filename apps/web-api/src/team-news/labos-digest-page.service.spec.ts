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

function build(opts: { member?: { name: string } | null; items?: unknown[]; choices?: unknown[] } = {}) {
  const prisma = {
    member: { findUnique: jest.fn(async () => (opts.member === undefined ? { name: 'Ada Lovelace' } : opts.member)) },
    teamNewsItem: {
      findMany: jest.fn(async () => opts.items ?? []),
      findUnique: jest.fn(async () => ({ tags: ['ai'] })),
    },
    labosDigestChoice: { findMany: jest.fn(async () => opts.choices ?? []) },
    $transaction: jest.fn(),
  };
  const vocabulary = {
    getVocabulary: jest.fn(async () => buildNewsTagVocabulary([{ uid: 'fa-ai', title: 'AI', parentUid: null }])),
  };
  const forum = { read: jest.fn(async () => ({ posts: [], unavailable: false })) };
  const cache = { reset: jest.fn() };
  const service = new LabosDigestPageService(prisma as any, vocabulary as any, forum as any, cache as any);
  return { service, prisma, forum };
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
