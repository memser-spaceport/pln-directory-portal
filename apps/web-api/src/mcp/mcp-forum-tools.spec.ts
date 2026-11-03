import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FORUM_PROOF_HEADER, forumCategories, forumTools } from './mcp-forum-tools';
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
      'Agents cannot post to the forum on this LabOS environment yet.'
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
      'Agents cannot post to the forum on this LabOS environment yet.'
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('skips categories without a usable cid', () => {
    expect(forumCategories({ categories: [{ cid: 0, name: 'Root' }, { name: 'No cid' }] })).toEqual([]);
  });
});
