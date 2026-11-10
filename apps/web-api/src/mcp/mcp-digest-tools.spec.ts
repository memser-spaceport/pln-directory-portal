jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: class AnalyticsService {} }));

import { ForbiddenException } from '@nestjs/common';
import { digestAdminNewsTools } from './mcp-digest-tools';
import { McpActorContext, toolsForPermissions } from './mcp-tools';

const member: McpActorContext = {
  memberUid: 'member-1',
  name: 'Ada',
  email: null,
  permissions: new Set(),
  authorizationUid: 'auth-1',
  clientName: 'Codex',
  agentAccess: 'read',
};

const admin: McpActorContext = { ...member, permissions: new Set(['directory.admin.full']) };

describe('admin digest MCP tools', () => {
  const listServiceNews = jest.fn();
  const tools = digestAdminNewsTools({ listServiceNews } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    listServiceNews.mockResolvedValue({
      page: 1,
      limit: 50,
      total: 1,
      items: [{ uid: 'a', title: 'Alpha', summary: 'A raise' }],
    });
  });

  it('hides the tools from a member who is not a directory admin', () => {
    expect(toolsForPermissions(new Set(), tools)).toEqual([]);
    expect(toolsForPermissions(new Set(['directory.admin.full']), tools).map((tool) => tool.name)).toEqual([
      'list_all_news',
      'get_digest_top_stories',
      'list_digest_sends',
      'get_digest_send',
    ]);
  });

  it('refuses a non-admin call and lists news for an admin', async () => {
    const list = tools.find((tool) => tool.name === 'list_all_news');
    await expect(list?.execute(member, { q: 'raise' })).rejects.toBeInstanceOf(ForbiddenException);

    const result = await list?.execute(admin, { q: 'raise', page: 1 });
    expect(listServiceNews).toHaveBeenCalledWith(expect.objectContaining({ q: 'raise', page: 1 }));
    expect(result).toEqual(expect.objectContaining({ total: 1, items: [expect.objectContaining({ title: 'Alpha' })] }));
  });
});
