import { LabosDigestForumReader, toDigestForumPost } from './labos-digest-forum.reader';

/** LAB-3263: the digest page reads the digest's forum topics with the forum API key. */
const topic = (tid: number, extra: Record<string, unknown> = {}) => ({
  tid,
  cid: 7,
  title: 'Grants &amp; funding',
  postcount: 4,
  posts: [
    {
      index: 0,
      content: '<p>Hello</p>',
      user: { username: 'ada', fullname: 'Ada L', teamName: 'Team A', teamRole: 'Lead', picture: 'https://x/a.png' },
    },
  ],
  ...extra,
});

describe('toDigestForumPost', () => {
  it('maps the opening post, decoding the title', () => {
    expect(toDigestForumPost(topic(5), 'https://web')).toEqual({
      tid: 5,
      title: 'Grants & funding',
      locked: false,
      authorName: 'Ada L',
      authorRole: 'Lead',
      authorTeam: 'Team A',
      authorAvatarUrl: 'https://x/a.png',
      contentHtml: '<p>Hello</p>',
      url: 'https://web/forum/topics/7/5',
      replyCount: 3,
    });
  });

  it('counts replies without the opening post, and none when the forum gives no count (LAB-3293)', () => {
    expect(toDigestForumPost(topic(5, { postcount: '1' }), '')?.replyCount).toBe(0);
    expect(toDigestForumPost(topic(5, { postcount: undefined }), '')?.replyCount).toBe(0);
  });

  it('drops a deleted topic and a relative avatar', () => {
    expect(toDigestForumPost(topic(5, { deleted: 1 }), '')).toBeNull();
    const post = toDigestForumPost(
      topic(5, { posts: [{ index: 0, content: 'x', user: { username: 'u', picture: '/a.png' } }] }),
      ''
    );
    expect(post?.authorAvatarUrl).toBeNull();
    expect(post?.authorName).toBe('u');
  });
});

describe('LabosDigestForumReader', () => {
  const env = { ...process.env };
  const realFetch = global.fetch;
  afterEach(() => {
    process.env = { ...env };
    global.fetch = realFetch;
  });

  const respond = (byTid: Record<number, { status: number; body?: unknown } | 'throw'>) =>
    (global.fetch = jest.fn(async (url: string) => {
      const tid = Number(String(url).split('/').pop());
      const r = byTid[tid];
      if (r === 'throw' || !r) throw new Error('network');
      return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
    }) as any);

  beforeEach(() => {
    process.env.FORUM_API_URL = 'https://forum/';
    process.env.FORUM_API_KEY = 'k';
    process.env.WEB_UI_BASE_URL = 'https://web';
  });

  it('reads the topics in link order, with the key, leaving out one the forum hides', async () => {
    respond({
      2: { status: 200, body: topic(2) },
      1: { status: 200, body: { response: topic(1) } },
      3: { status: 404 },
    });
    const result = await new LabosDigestForumReader().read([2, 3, 1]);
    expect(result.unavailable).toBe(false);
    expect(result.posts.map((p) => p.tid)).toEqual([2, 1]);
    expect((global.fetch as jest.Mock).mock.calls[0]).toEqual([
      'https://forum/api/topic/2',
      expect.objectContaining({ headers: { Authorization: 'Bearer k' } }),
    ]);
  });

  it('is unavailable when the forum does not answer at all', async () => {
    respond({ 1: 'throw', 2: { status: 502 } });
    await expect(new LabosDigestForumReader().read([1, 2])).resolves.toEqual({ posts: [], unavailable: true });
  });

  it('is unavailable without a key, and reads nothing', async () => {
    delete process.env.FORUM_API_KEY;
    respond({});
    await expect(new LabosDigestForumReader().read([1])).resolves.toEqual({ posts: [], unavailable: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('has nothing to read for a digest with no forum posts', async () => {
    respond({});
    await expect(new LabosDigestForumReader().read([])).resolves.toEqual({ posts: [], unavailable: false });
  });
});
