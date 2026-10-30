jest.mock('../push-notifications/push-notifications.service', () => ({ PushNotificationsService: jest.fn() }));
jest.mock('../deals/deals.service', () => ({ DealsService: jest.fn() }));
jest.mock('../articles/articles.service', () => ({ ArticlesService: jest.fn() }));
jest.mock('../member-follow-ups/member-follow-ups.service', () => ({ MemberFollowUpsService: jest.fn() }));
jest.mock('../office-hours/office-hours.service', () => ({ OfficeHoursService: jest.fn() }));
jest.mock('../notification-settings/notification-settings.service', () => ({ NotificationSettingsService: jest.fn() }));
jest.mock('../notification-settings/suggested-candidates-email-preference.service', () => ({
  SuggestedCandidatesEmailPreferenceService: jest.fn(),
}));
jest.mock('../notifications/notification-service.client', () => ({ NotificationServiceClient: jest.fn() }));
jest.mock('../demo-days/demo-days.service', () => ({ DemoDaysService: jest.fn() }));
jest.mock('../demo-days/demo-day-engagement.service', () => ({ DemoDayEngagementService: jest.fn() }));
jest.mock('../member-experiences/member-experiences.service', () => ({ MemberExperiencesService: jest.fn() }));
jest.mock('../follows/follows.service', () => ({ FollowsService: jest.fn() }));
jest.mock('../job-openings/job-openings-saved.service', () => ({ JobOpeningsSavedService: jest.fn() }));
jest.mock('../job-openings/job-openings-query.service', () => ({ JobOpeningsQueryService: jest.fn() }));
jest.mock('../job-alerts/job-alerts.service', () => ({ JobAlertsService: jest.fn() }));
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('../master-profile/master-profile.service', () => ({ MasterProfileService: jest.fn() }));
jest.mock('../warm-intros-v2/warm-intros-v2.service', () => ({ WarmIntrosV2Service: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: jest.fn() }));
jest.mock('../pl-events/pl-events.service', () => ({ PLEventsService: jest.fn() }));
jest.mock('../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../search/search.service', () => ({ SearchService: jest.fn() }));
jest.mock('../ai-apps/ai-apps.service', () => ({ AiAppsService: jest.fn() }));
jest.mock('../spv-spotlights/pl-network-portfolio.service', () => ({ PlNetworkPortfolioService: jest.fn() }));
jest.mock('./mcp-oauth.service', () => ({ McpOAuthService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));
jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
// The SDK's ESM build can't load under Jest 27, so a fake server records what the controller registers: the SDK lists
// exactly the registered tools and routes `tools/call` to their callbacks.
const registered = new Map<string, { description: string; inputSchema?: unknown; cb: (args?: unknown) => unknown }>();
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    registerTool: (name: string, cfg: { description: string; inputSchema?: unknown }, cb: any) =>
      registered.set(name, { ...cfg, cb }),
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    handleRequest: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { McpController } from './mcp.controller';
import { McpScopesService } from './mcp-scopes.service';
import { McpAccessRequestsService } from './mcp-access-requests.service';
import { MCP_NEEDS_WRITE_NOTE } from './mcp-tool-plan';

/**
 * Drives the real MCP SDK over HTTP (stateless Streamable HTTP), so `tools/list` and `tools/call` are what an agent
 * sees. Permissions give RBAC access to everything; only scope levels vary.
 */
function build(
  opts: {
    scopeLevels?: Record<string, string>;
    settings?: unknown[] | Error;
    requestsFail?: boolean;
    writeLimited?: boolean;
  } = {}
) {
  const actor = {
    authorizationUid: 'auth-1',
    memberUid: 'member-1',
    email: 'ada@example.com',
    name: 'Ada',
    clientName: 'Codex',
    scopeLevels: opts.scopeLevels ?? {},
  };
  const oauth = { authenticateAccessToken: jest.fn().mockResolvedValue(actor) };
  const accessControl = {
    getMemberAccess: jest.fn().mockResolvedValue({
      effectivePermissions: ['directory.admin.full', 'investor_db.edit', 'forum.read'],
    }),
  };
  const aiApps = {
    listOwnAppsForMcp: jest.fn().mockResolvedValue([{ uid: 'app-1' }]),
    updateFeedbackStatusForMcp: jest.fn().mockResolvedValue({ uid: 'fb-1', status: 'VIEWED' }),
  };
  const search = { getForumThreadByUid: jest.fn().mockResolvedValue({ uid: 't-1' }) };
  const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
  const settings = opts.settings ?? [];
  const prisma = {
    mcpScopeSetting: {
      findMany: jest.fn(async () => {
        if (settings instanceof Error) throw settings;
        return settings;
      }),
    },
  };
  const requests: Array<{ uid: string; scope: string; level: string; resolvedAt: null }> = [];
  const requestPrisma = {
    mcpAccessRequest: {
      findFirst: jest.fn(async ({ where }) => requests.find((r) => r.scope === where.scope) ?? null),
      create: jest.fn(async ({ data }) => {
        if (opts.requestsFail) throw new Error('db down');
        const row = { uid: `req-${requests.length + 1}`, resolvedAt: null, ...data };
        requests.push(row);
        return row;
      }),
      update: jest.fn(async () => ({})),
    },
  };
  const accessRequests = new McpAccessRequestsService(requestPrisma as any);
  const writeLimit = { tryConsume: jest.fn().mockResolvedValue(!opts.writeLimited) };
  const scopes = new McpScopesService(prisma as any, analytics as any, accessRequests);
  const stub = {} as any;
  const controller = new McpController(
    oauth as any,
    accessControl as any,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    search as any,
    aiApps as any,
    stub,
    analytics as any,
    scopes,
    accessRequests,
    stub,
    stub,
    stub,
    stub,
    stub,
    writeLimit as any,
    {} as any,
    {} as any,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub
  );
  /** One MCP request: returns what `tools/list` would show and a way to call a tool by name. */
  const handle = async (body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' }) => {
    registered.clear();
    await controller.handle({ headers: { authorization: 'Bearer mcp_at_live' }, body } as any, {} as any);
    return new Map(registered);
  };
  return { handle, aiApps, analytics, requests };
}

type Harness = ReturnType<typeof build>;

async function listed(h: Harness) {
  return [...(await h.handle()).entries()].map(([name, t]) => ({ name, description: t.description }));
}

async function call(h: Harness, name: string, args: Record<string, unknown> = {}) {
  const tools = await h.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } });
  const tool = tools.get(name);
  if (!tool) return { notFound: true } as const;
  return (await tool.cb(args)) as { isError?: boolean; content: Array<{ text: string }> };
}

describe('McpController scope enforcement', () => {
  const originalWeb = process.env.WEB_UI_BASE_URL;
  beforeAll(() => {
    process.env.WEB_UI_BASE_URL = 'https://labos.example';
  });
  afterAll(() => {
    process.env.WEB_UI_BASE_URL = originalWeb;
  });

  it('lists read tools on a read-only connection and runs them', async () => {
    const h = build();
    const { aiApps } = h;
    const names = (await listed(h)).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'whoami',
        'search_members',
        'get_forum_thread',
        'list_my_ai_apps',
        'list_news',
        'get_news_item',
      ])
    );

    const result: any = await call(h, 'list_my_ai_apps');
    expect(result.isError).toBeFalsy();
    expect(aiApps.listOwnAppsForMcp).toHaveBeenCalledWith('member-1');
  });

  it('lists a write tool with the needs-write note and refuses the call with a link', async () => {
    const h = build();
    const { aiApps, analytics } = h;
    const tool = (await listed(h)).find((t) => t.name === 'update_ai_app_feedback_status');
    expect(tool?.description.startsWith(MCP_NEEDS_WRITE_NOTE)).toBe(true);

    const result: any = await call(h, 'update_ai_app_feedback_status', { feedbackUid: 'fb-1', status: 'VIEWED' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      'This needs write access to AI Apps for this connection. Ask the member to allow it in LabOS: https://labos.example/settings/mcp?request=req-1'
    );
    expect(h.requests).toMatchObject([{ scope: 'ai_apps', level: 'write', toolName: 'update_ai_app_feedback_status' }]);
    expect(aiApps.updateFeedbackStatusForMcp).not.toHaveBeenCalled();
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp-tool-refused',
        properties: expect.objectContaining({
          toolName: 'update_ai_app_feedback_status',
          scope: 'ai_apps',
          reason: 'needs_write',
        }),
      })
    );
  });

  it('runs a write tool once the scope is at write', async () => {
    const h = build({ scopeLevels: { ai_apps: 'write' } });
    const { aiApps } = h;
    const tool = (await listed(h)).find((t) => t.name === 'update_ai_app_feedback_status');
    expect(tool?.description.startsWith(MCP_NEEDS_WRITE_NOTE)).toBe(false);
    const whoami: any = await call(h, 'whoami');
    expect(JSON.parse(whoami.content[0].text)).toMatchObject({ agentAccess: 'write' });
    await call(h, 'update_ai_app_feedback_status', { feedbackUid: 'fb-1', status: 'VIEWED' });
    expect(aiApps.updateFeedbackStatusForMcp).toHaveBeenCalled();
  });

  it('hides a scope at none, and answers a call by name with the read refusal', async () => {
    const h = build({ scopeLevels: { search: 'none' } });
    const names = (await listed(h)).map((t) => t.name);
    const SEARCH_TOOLS = ['search_members', 'search_teams', 'search_projects', 'search_events'];
    expect(names.filter((n) => SEARCH_TOOLS.includes(n))).toEqual([]);
    expect(names).toContain('search_master_profiles');
    expect(names).toContain('get_member');

    const result: any = await call(h, 'search_members', { query: 'ada' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('needs read access to Search');
    expect(result.content[0].text).toContain('https://labos.example/settings/mcp?request=req-1');

    // The agent retries: same request, same link.
    const again: any = await call(h, 'search_teams', { query: 'ada' });
    expect(again.content[0].text).toContain('?request=req-1');
    expect(h.requests).toHaveLength(1);
  });

  it('hides an admin-off scope from every connection and refuses it without a link', async () => {
    const h = build({ scopeLevels: { forum: 'read' }, settings: [{ scope: 'forum', maxLevel: 'none' }] });
    const { analytics } = h;
    const names = (await listed(h)).map((t) => t.name);
    expect(names).not.toContain('get_forum_thread');
    expect(names).not.toContain('search_forum_threads');

    const result = await call(h, 'get_forum_thread', { uid: 't-1' });
    expect(result).toMatchObject({ isError: true, content: [{ text: 'Forum is turned off by LabOS admins.' }] });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ properties: expect.objectContaining({ reason: 'admin_off' }) })
    );
    expect(h.requests).toEqual([]);
  });

  it('hides write tools when admins cap the scope at read, even for a write connection', async () => {
    const h = build({ scopeLevels: { ai_apps: 'write' }, settings: [{ scope: 'ai_apps', maxLevel: 'read' }] });
    const names = (await listed(h)).map((t) => t.name);
    expect(names).toContain('list_my_ai_apps');
    expect(names).not.toContain('update_ai_app_feedback_status');
    const result: any = await call(h, 'update_ai_app_feedback_status', { feedbackUid: 'fb-1', status: 'VIEWED' });
    expect(result.content[0].text).toBe('Changes in AI Apps are turned off by LabOS admins.');
  });

  it('fails closed to whoami when scope settings cannot be read', async () => {
    const h = build({ settings: new Error('db down') });
    expect((await listed(h)).map((t) => t.name)).toEqual(['whoami']);
    const result: any = await call(h, 'search_members', { query: 'ada' });
    expect(result).toMatchObject({ isError: true });
    expect(result.content[0].text).toContain("couldn't check this connection's permissions");
  });

  it('refuses a write over the hourly allowance without running it', async () => {
    const h = build({ scopeLevels: { ai_apps: 'write' }, writeLimited: true });
    const result: any = await call(h, 'update_ai_app_feedback_status', { feedbackUid: 'fb-1', status: 'VIEWED' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      'LabOS limits agents to 10 update_ai_app_feedback_status calls an hour. Try again later.'
    );
    expect(h.aiApps.updateFeedbackStatusForMcp).not.toHaveBeenCalled();
    expect(h.analytics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ properties: expect.objectContaining({ reason: 'rate_limited' }) })
    );
    expect(h.requests).toEqual([]);
  });

  it('still refuses, with the plain Settings link, when the request cannot be stored', async () => {
    const h = build({ requestsFail: true });
    const result: any = await call(h, 'update_ai_app_feedback_status', { feedbackUid: 'fb-1', status: 'VIEWED' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/LabOS: https:\/\/labos\.example\/settings\/mcp$/);
  });

  it('gives update_my_profile a schema that keeps unknown arguments, and other tools their raw shape (LAB-3020)', async () => {
    const tools = await build({ scopeLevels: { profile: 'write' } }).handle();
    const schema = tools.get('update_my_profile')?.inputSchema as { parse: (v: unknown) => unknown };
    expect(schema.parse({ bio: 'ok', email: 'evil@example.com' })).toEqual({ bio: 'ok', email: 'evil@example.com' });
    expect(tools.get('search_teams')?.inputSchema).not.toHaveProperty('parse');
  });

  it('registers nothing for a tool outside the registry, so the SDK answers "not found"', async () => {
    const h = build();
    expect(await call(h, 'delete_everything')).toEqual({ notFound: true });
  });

  it('registers a hidden tool only for the call that names it, also inside a batch', async () => {
    const h = build({ scopeLevels: { search: 'none' } });
    const tools = await h.handle([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_teams', arguments: {} } },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
    ]);
    expect(tools.has('search_teams')).toBe(true);
    expect(tools.has('search_members')).toBe(false);
    expect(tools.get('search_teams')?.inputSchema).toBeUndefined();
  });
});
