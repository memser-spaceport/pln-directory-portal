import { NotFoundException } from '@nestjs/common';
import { ANALYTICS_EVENTS } from '../utils/constants';
import {
  buildMcpToolAnalyticsProperties,
  MCP_TOOL_PROPERTY_BUILDERS,
  MCP_TOOL_QUERY_ARGS,
  mcpToolCalledEventName,
  mcpToolOperation,
  trackMcpToolCalled,
  trackMcpToolInvocation,
} from './mcp-analytics';
import { MCP_TOOL_SCOPES, MCP_UNSCOPED_TOOLS } from './mcp-scopes.registry';

const TOOLS = [
  'whoami',
  'search_master_profiles',
  'get_master_profile',
  'search_warm_intro_investors',
  'get_warm_intro_investor',
  'submit_warm_path_feedback',
  'get_warm_path_feedback',
  'submit_warm_path_note',
  'get_warm_path_note',
] as const;

describe('mcpToolOperation', () => {
  it.each([
    ['whoami', 'read'],
    ['search_master_profiles', 'read'],
    ['get_master_profile', 'read'],
    ['search_warm_intro_investors', 'read'],
    ['get_warm_intro_investor', 'read'],
    ['get_warm_path_feedback', 'read'],
    ['get_warm_path_note', 'read'],
    ['submit_warm_path_feedback', 'write'],
    ['submit_warm_path_note', 'write'],
    ['update_master_profile', 'write'],
    ['update_connection_edge', 'write'],
    ['update_warm_path', 'write'],
  ] as const)('%s is %s', (toolName, operation) => {
    expect(mcpToolOperation(toolName)).toBe(operation);
  });

  it('classifies all v0 tools', () => {
    expect(TOOLS.map((name) => mcpToolOperation(name))).toEqual([
      'read',
      'read',
      'read',
      'read',
      'read',
      'write',
      'read',
      'write',
      'read',
    ]);
  });
});

describe('buildMcpToolAnalyticsProperties', () => {
  it('includes resultCount for search tools and omits queries, emails, and notes', () => {
    const searchProfiles = buildMcpToolAnalyticsProperties(
      'search_master_profiles',
      { name: 'Jane', email: 'jane@example.com', limit: 20, offset: 0 },
      { profiles: [{ uid: 'u1' }, { uid: 'u2' }], limit: 20, offset: 0 }
    );
    expect(searchProfiles).toEqual({ limit: 20, offset: 0, resultCount: 2 });
    expect(searchProfiles).not.toHaveProperty('name');
    expect(searchProfiles).not.toHaveProperty('email');
    expect(searchProfiles).not.toHaveProperty('search');

    const searchInvestors = buildMcpToolAnalyticsProperties(
      'search_warm_intro_investors',
      { search: 'secret query', limit: 10, offset: 5 },
      { investors: [{ profileUid: 'p1' }], total: 41, limit: 10, offset: 5 }
    );
    expect(searchInvestors).toEqual({ limit: 10, offset: 5, resultCount: 1, total: 41 });
    expect(searchInvestors).not.toHaveProperty('search');
  });

  it('records counts and filters for list_portfolio_teams without the name query', () => {
    const props = buildMcpToolAnalyticsProperties(
      'list_portfolio_teams',
      { q: 'agoric', island: 'digital-human-rights' },
      { teams: [{ teamUid: 't1' }], total: 1, limit: 20, offset: 0, nextOffset: null }
    );
    expect(props).toEqual({
      hasQuery: true,
      island: 'digital-human-rights',
      limit: 20,
      offset: 0,
      resultCount: 1,
      total: 1,
    });
    expect(props).not.toHaveProperty('q');
  });

  it('includes uids only for get tools', () => {
    expect(buildMcpToolAnalyticsProperties('get_master_profile', { uid: 'mp-1' })).toEqual({ uid: 'mp-1' });
    expect(
      buildMcpToolAnalyticsProperties(
        'get_warm_intro_investor',
        { profileUid: 'inv-1' },
        { paths: [{ uid: 'p1' }, { uid: 'p2' }] }
      )
    ).toEqual({ profileUid: 'inv-1', pathCount: 2 });
  });

  it('flags isClear for submit tools and never includes note body', () => {
    const submitted = buildMcpToolAnalyticsProperties(
      'submit_warm_path_note',
      { warmPathUid: 'p1', connectorProfileUid: 'from1', note: 'Reached out last week' },
      { note: 'Reached out last week' }
    );
    expect(submitted).toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      isClear: false,
    });
    expect(submitted).not.toHaveProperty('note');

    const cleared = buildMcpToolAnalyticsProperties('submit_warm_path_feedback', {
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
    });
    expect(cleared).toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      isClear: true,
    });
  });

  it('counts locked fields and omits their values', () => {
    const props = buildMcpToolAnalyticsProperties('update_master_profile', {
      uid: 'u1',
      fields: { bio: 'secret', currentOrg: 'PL' },
    });
    expect(props).toEqual({ uid: 'u1', fieldCount: 2 });
    expect(props).not.toHaveProperty('bio');
    expect(props).not.toHaveProperty('fields');
  });

  it('adds errorKind from the exception class name only', () => {
    const props = buildMcpToolAnalyticsProperties(
      'get_warm_intro_investor',
      { profileUid: 'missing' },
      null,
      new NotFoundException('No warm paths found for investor: missing')
    );
    expect(props.errorKind).toBe('NotFoundException');
    expect(JSON.stringify(props)).not.toContain('No warm paths found');
  });
});

describe('trackMcpToolInvocation', () => {
  it('sends mcp-tool-invoked with actor identity and no email', () => {
    const trackEvent = jest.fn();
    trackMcpToolInvocation(
      { trackEvent } as never,
      { memberUid: 'm1', clientName: 'Claude Code', authorizationUid: 'auth-1' },
      {
        toolName: 'whoami',
        success: true,
        isError: false,
        result: { memberUid: 'm1', name: 'Ada', email: 'ada@example.com' },
      }
    );

    expect(trackEvent).toHaveBeenCalledWith({
      name: ANALYTICS_EVENTS.MCP.TOOL_INVOKED,
      distinctId: 'm1',
      properties: {
        toolName: 'whoami',
        operation: 'read',
        success: true,
        isError: false,
        memberUid: 'm1',
        clientName: 'Claude Code',
        authorizationUid: 'auth-1',
      },
    });
    const props = trackEvent.mock.calls[0][0].properties;
    expect(props).not.toHaveProperty('email');
    expect(props).not.toHaveProperty('name');
  });
});

describe('per-tool events (LAB-3050)', () => {
  const ALL_TOOLS = [...Object.keys(MCP_TOOL_SCOPES), ...MCP_UNSCOPED_TOOLS];
  const actor = { memberUid: 'm1', clientName: 'Claude Code', authorizationUid: 'auth-1' };

  it('maps every registry tool and whoami to one property builder', () => {
    expect(Object.keys(MCP_TOOL_PROPERTY_BUILDERS).sort()).toEqual([...ALL_TOOLS].sort());
  });

  it('gives every tool its own mcp-<tool>-called event name', () => {
    const names = ALL_TOOLS.map(mcpToolCalledEventName);
    expect(new Set(names).size).toBe(ALL_TOOLS.length);
    for (const name of names) {
      expect(name).toMatch(/^mcp-[a-z0-9]+(-[a-z0-9]+)*-called$/);
    }
    expect(mcpToolCalledEventName('search_members')).toBe('mcp-search-members-called');
    expect(mcpToolCalledEventName('post_team_news')).toBe('mcp-post-team-news-called');
  });

  it('only takes query text from tools that are in the registry', () => {
    for (const tool of Object.keys(MCP_TOOL_QUERY_ARGS)) {
      expect(MCP_TOOL_PROPERTY_BUILDERS[tool]).toBeDefined();
    }
  });

  it('sends the common properties, the query trimmed to 200 characters and the result count for a search', () => {
    const trackEvent = jest.fn();
    const q = `  ${'a'.repeat(250)}  `;
    trackMcpToolCalled({ trackEvent } as never, actor, {
      toolName: 'search_members',
      result: 'ok',
      args: { q, limit: 5 },
      output: { results: [{ uid: 'u1' }, { uid: 'u2' }], limit: 5 },
    });
    expect(trackEvent).toHaveBeenCalledWith({
      name: 'mcp-search-members-called',
      distinctId: 'm1',
      properties: {
        toolName: 'search_members',
        memberUid: 'm1',
        authorizationUid: 'auth-1',
        clientName: 'Claude Code',
        scope: 'search',
        operation: 'read',
        result: 'ok',
        limit: 5,
        resultCount: 2,
        query: 'a'.repeat(200),
      },
    });
  });

  it('sends list_news filters and its search text', () => {
    const trackEvent = jest.fn();
    trackMcpToolCalled({ trackEvent } as never, actor, {
      toolName: 'list_news',
      result: 'ok',
      args: { feed: 'for_you', search: 'funding', teamUid: 't1', limit: 10, page: 2 },
      output: { feed: 'latest', page: 2, hasMore: false, items: [{ uid: 'n1' }] },
    });
    expect(trackEvent.mock.calls[0][0].properties).toMatchObject({
      feed: 'latest',
      teamUid: 't1',
      limit: 10,
      page: 2,
      resultCount: 1,
      hasMore: false,
      query: 'funding',
    });
  });

  it('sends no query text for investor DB searches', () => {
    const trackEvent = jest.fn();
    trackMcpToolCalled({ trackEvent } as never, actor, {
      toolName: 'search_master_profiles',
      result: 'ok',
      args: { name: 'Jane Doe', email: 'jane@example.com', type: 'investor' },
      output: { profiles: [] },
    });
    const props = trackEvent.mock.calls[0][0].properties;
    expect(props).toMatchObject({ scope: 'investors', type: 'investor', resultCount: 0 });
    expect(JSON.stringify(props)).not.toMatch(/Jane|jane@example\.com/);
  });

  it('sends whoami with scope unscoped and without the member email', () => {
    const trackEvent = jest.fn();
    trackMcpToolCalled({ trackEvent } as never, actor, {
      toolName: 'whoami',
      result: 'ok',
      output: { memberUid: 'm1', name: 'Ada', email: 'ada@example.com' },
    });
    const props = trackEvent.mock.calls[0][0].properties;
    expect(props).toMatchObject({ scope: 'unscoped', operation: 'read', result: 'ok' });
    expect(JSON.stringify(props)).not.toContain('ada@example.com');
  });

  it('sends a refusal with its reason and nothing from the arguments', () => {
    const trackEvent = jest.fn();
    trackMcpToolCalled({ trackEvent } as never, actor, {
      toolName: 'post_team_news',
      result: 'refused',
      reason: 'needs_write',
      args: { teamUid: 't1', title: 'Big raise', body: 'Secret details' },
    });
    expect(trackEvent).toHaveBeenCalledWith({
      name: 'mcp-post-team-news-called',
      distinctId: 'm1',
      properties: {
        toolName: 'post_team_news',
        memberUid: 'm1',
        authorizationUid: 'auth-1',
        clientName: 'Claude Code',
        scope: 'news',
        operation: 'write',
        result: 'refused',
        reason: 'needs_write',
      },
    });
  });

  it('sends errorKind and not the error message on an error', () => {
    const trackEvent = jest.fn();
    trackMcpToolCalled({ trackEvent } as never, actor, {
      toolName: 'get_team',
      result: 'error',
      args: { uid: 't1' },
      error: new NotFoundException('Team not found: t1 (secret)'),
    });
    const props = trackEvent.mock.calls[0][0].properties;
    expect(props).toMatchObject({ result: 'error', errorKind: 'NotFoundException', uid: 't1' });
    expect(JSON.stringify(props)).not.toContain('secret');
  });

  describe('write tools send ids, field names and counts only', () => {
    const SECRET = 'SECRET-VALUE';
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>?]> = [
      [
        'post_team_news',
        { teamUid: 't1', title: SECRET, url: `https://x.io/${SECRET}`, body: SECRET },
        { posted: { uid: 'n1', title: SECRET } },
      ],
      [
        'update_my_profile',
        {
          bio: SECRET,
          moreDetails: SECRET,
          telegramHandler: SECRET,
          linkedinHandler: SECRET,
          email: `${SECRET}@example.com`,
        },
      ],
      ['update_team', { teamUid: 't1', shortDescription: SECRET, contactMethod: `${SECRET}@example.com` }],
      [
        'update_project',
        { projectUid: 'p1', description: SECRET, readMe: SECRET, projectLinks: [{ name: SECRET, url: SECRET }] },
      ],
      ['join_team', { teamUid: 't1', role: SECRET, mainTeam: true }],
      ['join_project', { projectUid: 'p1', role: SECRET, description: SECRET }],
      [
        'add_experience',
        { title: SECRET, company: SECRET, location: SECRET, startDate: '2024-01-01' },
        { added: { uid: 'e1', title: SECRET } },
      ],
      ['update_experience', { experienceUid: 'e1', title: SECRET, company: SECRET }],
      ['set_job_alert', { name: SECRET, q: SECRET, roleCategories: [SECRET] }],
      ['update_email_preferences', { forumDigest: 'weekly', newsletter: false }],
      ['submit_warm_path_note', { warmPathUid: 'w1', connectorProfileUid: 'c1', note: SECRET }],
      ['update_master_profile', { uid: 'u1', fields: { bio: SECRET } }],
      ['update_ai_app_feedback_status', { appUid: 'a1', feedbackUid: 'f1', status: 'VIEWED', note: SECRET }],
    ];

    // Every row has three cells, so Jest never takes the third argument for a done callback.
    it.each(cases.map(([toolName, args, output]) => [toolName, args, output ?? null] as const))(
      '%s',
      (toolName, args, output) => {
        const trackEvent = jest.fn();
        trackMcpToolCalled({ trackEvent } as never, actor, { toolName, result: 'ok', args, output });
        const sent = JSON.stringify(trackEvent.mock.calls[0][0]);
        expect(sent).not.toContain(SECRET);
        expect(trackEvent.mock.calls[0][0].properties).toMatchObject({ operation: 'write', result: 'ok' });
      }
    );

    it('names the changed fields', () => {
      expect(
        buildMcpToolAnalyticsProperties('update_team', { teamUid: 't1', website: 'x', shortDescription: 'y' })
      ).toEqual({ teamUid: 't1', fields: ['shortDescription', 'website'], fieldCount: 2 });
      expect(
        buildMcpToolAnalyticsProperties('post_team_news', { teamUid: 't1', body: 'b' }, { posted: { uid: 'n1' } })
      ).toEqual({
        teamUid: 't1',
        newsUid: 'n1',
        hasBody: true,
      });
    });
  });
});
