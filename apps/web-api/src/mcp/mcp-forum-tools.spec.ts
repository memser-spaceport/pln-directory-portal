import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FORUM_PROOF_HEADER, forumCategories, forumPlainText, forumThreadRows, forumTools } from './mcp-forum-tools';
import { McpActorContext } from './mcp-tools';

const request = jest.fn();
global.fetch = request as unknown as typeof fetch;

/** A fetch Response for NodeBB's JSON answer. */
function answer(status: number, data: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

/** The URL and options fetch was called with, the body parsed back. */
function call(n = 0) {
  const [url, init] = request.mock.calls[n];
  return { url, method: init.method, headers: init.headers, data: init.body ? JSON.parse(init.body) : undefined };
}

const CTX: McpActorContext = {
  memberUid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(['forum.read', 'forum.write']),
  authorizationUid: 'auth-1',
  clientName: 'Claude Code',
  agentAccess: 'read',
};

function build() {
  const proofs = { issueForAuthorization: jest.fn().mockResolvedValue({ proof: 'mcp_mp_abc', expiresAt: new Date() }) };
  const tools = Object.fromEntries(forumTools(proofs as any).map((tool) => [tool.name, tool]));
  return { proofs, tools };
}

describe('forum tools (LAB-3031)', () => {
  const env = { ...process.env };

  beforeEach(() => {
    request.mockReset();
    process.env.FORUM_API_URL = 'https://forum.example/';
    process.env.FORUM_MEMBER_PROOF_AUDIENCE = 'key-nodebb';
    process.env.WEB_UI_BASE_URL = 'https://labos.example';
  });

  afterAll(() => {
    process.env = env;
  });

  it('starts a thread as the member: a fresh forum proof for this connection, sent as the only credential', async () => {
    const { proofs, tools } = build();
    request.mockResolvedValue(
      answer(200, {
        status: { code: 'ok' },
        response: { tid: 42, cid: 2, mainPid: 100, title: 'Q&amp;A &#x27;hello&#x27;' },
      })
    );

    const result = await tools.start_forum_thread.execute(CTX, {
      cid: 2,
      title: 'Hello',
      content: 'First post',
      tags: ['ipfs'],
    });

    expect(proofs.issueForAuthorization).toHaveBeenCalledWith('auth-1', 'key-nodebb', 'forum');
    expect(call()).toEqual({
      url: 'https://forum.example/api/v3/topics',
      method: 'POST',
      data: { cid: 2, title: 'Hello', content: 'First post', tags: ['ipfs'] },
      headers: { [FORUM_PROOF_HEADER]: 'mcp_mp_abc', 'Content-Type': 'application/json' },
    });
    expect(request.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      posted: { tid: 42, cid: 2, pid: 100, title: "Q&A 'hello'", url: 'https://labos.example/forum/topics/2/42' },
    });
  });

  it('replies in a thread, to one post when toPid is given', async () => {
    const { tools } = build();
    request.mockResolvedValue(answer(200, { response: { pid: 7, tid: 42, topic: { cid: 2 } } }));

    const result = await tools.reply_to_forum_thread.execute(CTX, { tid: 42, content: 'Agreed', toPid: 100 });

    expect(call()).toMatchObject({
      method: 'POST',
      url: 'https://forum.example/api/v3/topics/42',
      data: { content: 'Agreed', toPid: 100 },
    });
    expect(result).toEqual({ posted: { pid: 7, tid: 42, cid: 2, url: 'https://labos.example/forum/topics/2/42' } });
  });

  it('mints a new proof for every call: a proof redeems once', async () => {
    const { proofs, tools } = build();
    request.mockResolvedValue(answer(200, { response: { pid: 7 } }));

    await tools.reply_to_forum_thread.execute(CTX, { tid: 1, content: 'a' });
    await tools.reply_to_forum_thread.execute(CTX, { tid: 1, content: 'b' });

    expect(proofs.issueForAuthorization).toHaveBeenCalledTimes(2);
  });

  it('lists the categories the member can post in', async () => {
    const { tools } = build();
    request.mockResolvedValue(
      answer(200, {
        response: {
          categories: [
            { cid: -1, name: '[[category:uncategorized]]' },
            { cid: 1, name: 'Announcements', description: 'News', parentCid: 0 },
            { cid: 3, name: 'Docs link', link: 'https://docs.example' },
            { cid: 4, name: 'Old', disabled: 1 },
            { cid: 2, name: 'General', children: [{ cid: 5, name: 'Help', parentCid: 2 }] },
            { cid: 6, name: 'Comments &amp; Feedback', description: 'Got a question? Ask &#x2F; tell us' },
          ],
        },
      })
    );

    const result = await tools.list_forum_categories.execute(CTX, {});

    expect(call()).toEqual({
      method: 'GET',
      url: 'https://forum.example/api/v3/categories',
      headers: { [FORUM_PROOF_HEADER]: 'mcp_mp_abc', 'Content-Type': 'application/json' },
      data: undefined,
    });
    expect(result).toEqual({
      categories: [
        { cid: 1, name: 'Announcements', description: 'News' },
        { cid: 2, name: 'General' },
        { cid: 5, name: 'Help', parentCid: 2 },
        { cid: 6, name: 'Comments & Feedback', description: 'Got a question? Ask / tell us' },
      ],
    });
  });

  it('passes NodeBB refusals to the agent in its own words', async () => {
    const { tools } = build();
    request.mockResolvedValueOnce(
      answer(403, { error: 'No forum account for this member; sign in to the forum once first' })
    );
    await expect(tools.start_forum_thread.execute(CTX, { cid: 2, title: 't', content: 'c' })).rejects.toThrow(
      new BadRequestException('No forum account for this member; sign in to the forum once first')
    );

    request.mockResolvedValueOnce(
      answer(403, { status: { code: 'forbidden', message: 'You do not have enough privileges for this action.' } })
    );
    await expect(tools.reply_to_forum_thread.execute(CTX, { tid: 1, content: 'c' })).rejects.toThrow(
      'You do not have enough privileges for this action.'
    );

    request.mockResolvedValueOnce(answer(404, { status: { message: 'Topic does not exist' } }));
    await expect(tools.reply_to_forum_thread.execute(CTX, { tid: 999, content: 'c' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('tells the agent to try again when the forum is down or the proof was refused', async () => {
    const { tools } = build();
    request.mockResolvedValueOnce(answer(503, { error: 'Member proof redeem failed' }));
    await expect(tools.list_forum_categories.execute(CTX, {})).rejects.toThrow('The forum did not answer');

    request.mockRejectedValueOnce(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
    await expect(tools.list_forum_categories.execute(CTX, {})).rejects.toThrow('The forum did not answer');

    request.mockResolvedValueOnce(answer(401, { error: 'Invalid member proof' }));
    await expect(tools.list_forum_categories.execute(CTX, {})).rejects.toThrow('could not confirm this member');
  });

  it('does not call the forum when this environment has no forum audience', async () => {
    const { proofs, tools } = build();
    delete process.env.FORUM_MEMBER_PROOF_AUDIENCE;

    await expect(tools.start_forum_thread.execute(CTX, { cid: 2, title: 't', content: 'c' })).rejects.toThrow(
      'Agents cannot use the forum on this LabOS environment yet.'
    );
    expect(proofs.issueForAuthorization).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('stops at the proof when the connection was disconnected or lost Forum access', async () => {
    const { proofs, tools } = build();
    proofs.issueForAuthorization.mockRejectedValueOnce(new ForbiddenException('This connection is no longer allowed'));
    await expect(tools.reply_to_forum_thread.execute(CTX, { tid: 1, content: 'c' })).rejects.toThrow(
      new BadRequestException('This connection is no longer allowed')
    );

    proofs.issueForAuthorization.mockRejectedValueOnce(new NotFoundException('Unknown audience'));
    await expect(tools.reply_to_forum_thread.execute(CTX, { tid: 1, content: 'c' })).rejects.toThrow(
      'Agents cannot use the forum on this LabOS environment yet.'
    );
    expect(request).not.toHaveBeenCalled();
  });

  describe('reading threads from NodeBB as the member', () => {
    /** One post of NodeBB's /api/search answer (posts.getPostSummaryByPids). */
    const hit = (pid: number, tid: number, extra: Record<string, unknown> = {}) => ({
      pid,
      tid,
      content: `<p>Post ${pid} about <strong>IPFS</strong> &amp; Filecoin</p>`,
      topic: { tid, cid: 3, title: `Thread ${tid} &#x27;q&#x27;`, slug: `${tid}/thread-${tid}`, postcount: 4 },
      ...extra,
    });

    it('searches through NodeBB with a fresh proof, one row per thread in rank order', async () => {
      const { proofs, tools } = build();
      request.mockResolvedValue(
        answer(200, { posts: [hit(10, 1), hit(11, 2), hit(12, 1)], matchCount: 3, pageCount: 1 })
      );

      const result = await tools.search_forum_threads.execute(CTX, { q: 'ipfs filecoin', limit: 5 });

      expect(proofs.issueForAuthorization).toHaveBeenCalledWith('auth-1', 'key-nodebb', 'forum');
      const { url, method, headers } = call();
      expect(method).toBe('GET');
      expect(headers).toEqual({ [FORUM_PROOF_HEADER]: 'mcp_mp_abc', 'Content-Type': 'application/json' });
      const sent = new URL(url);
      expect(sent.origin + sent.pathname).toBe('https://forum.example/api/search');
      expect(sent.search).toBe('?term=ipfs+filecoin&in=titlesposts&matchWords=all&itemsPerPage=15&searchOnly=1');
      expect(result).toEqual({
        limit: 5,
        results: [
          {
            uid: '1',
            topicTitle: "Thread 1 'q'",
            topicSlug: '1/thread-1',
            topicUrl: 'https://labos.example/forum/topics/3/1',
            replyCount: 3,
            cid: 3,
            snippet: 'Post 10 about IPFS & Filecoin',
          },
          expect.objectContaining({ uid: '2', snippet: 'Post 11 about IPFS & Filecoin' }),
        ],
      });
    });

    it('defaults the limit to 20 threads and never asks NodeBB for more than 100 posts', async () => {
      const { tools } = build();
      request.mockResolvedValue(answer(200, { posts: [] }));

      await expect(tools.search_forum_threads.execute(CTX, { q: 'x' })).resolves.toEqual({ results: [], limit: 20 });
      expect(new URL(call(0).url).searchParams.get('itemsPerPage')).toBe('60');

      await tools.search_forum_threads.execute(CTX, { q: 'x', limit: 50 });
      expect(new URL(call(1).url).searchParams.get('itemsPerPage')).toBe('100');
    });

    it('leaves deleted posts and threads out of search rows and stops at the limit', () => {
      const rows = forumThreadRows(
        {
          posts: [
            hit(1, 1, { deleted: 1 }),
            hit(2, 2, { topic: { tid: 2, cid: 3, title: 'Gone', deleted: 1 } }),
            hit(3, 3),
            hit(4, 4),
            { pid: 5, content: 'no topic' },
          ],
        },
        1
      );
      expect(rows.map((row) => row.uid)).toEqual(['3']);
    });

    it('reads a whole thread as plain text: posts oldest first, deleted ones left out', async () => {
      const { tools } = build();
      request.mockResolvedValue(
        answer(200, {
          tid: 3,
          cid: 3,
          title: 'Test post (LAB-3076 MCP forum write)',
          slug: '3/test-post',
          postcount: 3,
          locked: 0,
          tags: [{ value: 'mcp' }],
          posts: [
            {
              pid: 4,
              index: 0,
              timestampISO: '2026-11-04T10:00:00.000Z',
              upvotes: 2,
              user: { username: 'olegverzunov', displayname: 'Oleg V' },
              content: '<p>First line<br />second line</p>\n<p>See <a href="https://ipfs.tech">the docs</a></p>',
            },
            { pid: 5, index: 1, deleted: 1, content: '<p>[[topic:post-is-deleted]]</p>', user: { username: 'x' } },
            {
              pid: 6,
              index: 2,
              toPid: 4,
              timestampISO: '2026-11-04T11:00:00.000Z',
              user: { username: 'ada' },
              content: '<ul><li>one</li><li>two</li></ul>',
            },
          ],
        })
      );

      const thread = await tools.get_forum_thread.execute(CTX, { uid: '3' });

      expect(call().url).toBe('https://forum.example/api/topic/3');
      expect(thread).toEqual({
        uid: '3',
        tid: 3,
        cid: 3,
        title: 'Test post (LAB-3076 MCP forum write)',
        url: 'https://labos.example/forum/topics/3/3',
        replyCount: 2,
        locked: false,
        tags: ['mcp'],
        truncated: false,
        posts: [
          {
            pid: 4,
            index: 0,
            author: 'Oleg V',
            postedAt: '2026-11-04T10:00:00.000Z',
            upvotes: 2,
            content: 'First line\nsecond line\n\nSee the docs (https://ipfs.tech)',
          },
          {
            pid: 6,
            index: 2,
            author: 'ada',
            postedAt: '2026-11-04T11:00:00.000Z',
            toPid: 4,
            upvotes: 0,
            content: '- one\n- two',
          },
        ],
      });
    });

    it('says the thread is truncated when NodeBB sent one page of a longer thread', async () => {
      const { tools } = build();
      request.mockResolvedValue(answer(200, { tid: 9, cid: 2, title: 'Long', postcount: 45, posts: [{ pid: 1 }] }));
      await expect(tools.get_forum_thread.execute(CTX, { uid: '9' })).resolves.toMatchObject({
        replyCount: 44,
        truncated: true,
      });
    });

    it('refuses a uid that is not a thread id without calling the forum', async () => {
      const { proofs, tools } = build();
      await expect(tools.get_forum_thread.execute(CTX, { uid: '3/../../api/admin' })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(proofs.issueForAuthorization).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    });

    it('passes NodeBB refusals through: unknown thread is not found', async () => {
      const { tools } = build();
      request.mockResolvedValueOnce(answer(404, {}));
      await expect(tools.get_forum_thread.execute(CTX, { uid: '999' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('turns post HTML into plain text, stripping tags before decoding entities', () => {
    expect(forumPlainText('<p>Use &lt;b&gt; for bold &amp;amp; more</p>')).toBe('Use <b> for bold &amp; more');
    expect(forumPlainText('<p><a href="https://x.io/a?b=1&amp;c=2">https://x.io/a?b=1&amp;c=2</a></p>')).toBe(
      'https://x.io/a?b=1&c=2'
    );
    expect(forumPlainText('<p>Hi <a href="/user/ada">@ada</a></p>')).toBe('Hi @ada');
    expect(forumPlainText(undefined)).toBe('');
  });

  it('skips categories without a usable cid', () => {
    expect(forumCategories({ categories: [{ cid: 0, name: 'Root' }, { name: 'No cid' }] })).toEqual([]);
  });
});
