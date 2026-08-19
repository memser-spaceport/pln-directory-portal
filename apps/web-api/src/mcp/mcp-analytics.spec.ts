import { NotFoundException } from '@nestjs/common';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { buildMcpToolAnalyticsProperties, mcpToolOperation, trackMcpToolInvocation } from './mcp-analytics';

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
