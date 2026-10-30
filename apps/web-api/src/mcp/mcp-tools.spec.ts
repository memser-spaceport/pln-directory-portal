import { BadRequestException, NotFoundException } from '@nestjs/common';
import { isAllowedRedirectUri, isLoopbackRedirectUri, isRegisteredRedirectUri } from './mcp-redirect';
import { pkceS256Challenge, verifyPkceS256 } from './mcp.crypto';
import {
  compactMasterProfile,
  compactOwnPathFeedback,
  compactWarmIntroInvestor,
  getMasterProfile,
  getWarmIntroInvestor,
  getWarmPathFeedback,
  getWarmPathNote,
  searchMasterProfiles,
  searchWarmIntroInvestors,
  submitWarmPathFeedback,
  submitWarmPathNote,
  toolsForPermissions,
  warmIntroTools,
  WHOAMI_TOOL,
} from './mcp-tools';
import { MasterProfileService } from '../master-profile/master-profile.service';
import { WarmIntrosV2Service } from '../warm-intros-v2/warm-intros-v2.service';
import { aiAppFeedbackTools, aiAppWriteTools } from './mcp-ai-app-feedback-tools';
import { directoryTools } from './mcp-directory-tools';
import { portfolioTools } from './mcp-portfolio-tools';
import { newsTools } from './mcp-news-tools';
import { directoryWriteTools, eventWriteTools, membershipTools, newsWriteTools, profileTools } from './mcp-write-tools';
import {
  demoDaySaveTools,
  emailPreferenceTools,
  experienceTools,
  followTools,
  jobAlertTools,
  savedJobTools,
} from './mcp-member-action-tools';
import { isWriteTool, MCP_TOOL_SCOPES, MCP_UNSCOPED_TOOLS, registryMaxLevel } from './mcp-scopes.registry';

describe('mcp-redirect', () => {
  it('treats localhost, 127.0.0.1, and ::1 as loopback', () => {
    expect(isLoopbackRedirectUri('http://127.0.0.1:9/cb')).toBe(true);
    expect(isLoopbackRedirectUri('http://localhost:9/cb')).toBe(true);
    expect(isLoopbackRedirectUri('http://[::1]:9/cb')).toBe(true);
    expect(isLoopbackRedirectUri('https://labos.example/cb')).toBe(false);
  });

  it('allows loopback, https, and private-use schemes', () => {
    expect(isAllowedRedirectUri('http://127.0.0.1:8787/callback')).toBe(true);
    expect(isAllowedRedirectUri('https://www.cursor.com/agents/mcp/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('https://chatgpt.com/connector/oauth/abc')).toBe(true);
    expect(isAllowedRedirectUri('cursor://anysphere.cursor-mcp/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('vscode://vscode.github-authentication/did-authenticate')).toBe(true);
    expect(isAllowedRedirectUri('http://evil.example/callback')).toBe(false);
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUri('https://user:pass@evil.example/cb')).toBe(false);
  });

  it('matches registered URIs and ignores loopback port', () => {
    const registered = [
      'http://127.0.0.1:9/cb',
      'https://www.cursor.com/agents/mcp/oauth/callback',
      'cursor://anysphere.cursor-mcp/oauth/callback',
    ];
    expect(isRegisteredRedirectUri('http://127.0.0.1:9/cb', registered)).toBe(true);
    expect(isRegisteredRedirectUri('http://127.0.0.1:8/cb', registered)).toBe(true);
    expect(isRegisteredRedirectUri('https://www.cursor.com/agents/mcp/oauth/callback', registered)).toBe(true);
    expect(isRegisteredRedirectUri('cursor://anysphere.cursor-mcp/oauth/callback', registered)).toBe(true);
    expect(isRegisteredRedirectUri('https://evil.example/callback', registered)).toBe(false);
    expect(isRegisteredRedirectUri('http://127.0.0.1:9/other', registered)).toBe(false);
  });
});

describe('mcp.crypto PKCE', () => {
  it('verifies S256', () => {
    const verifier = 'plain-code-verifier-value-0123456789';
    const challenge = pkceS256Challenge(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false);
  });
});

const WARM_INTRO_TOOL_NAMES = [
  'whoami',
  'search_master_profiles',
  'get_master_profile',
  'search_warm_intro_investors',
  'get_warm_intro_investor',
  'submit_warm_path_feedback',
  'get_warm_path_feedback',
  'submit_warm_path_note',
  'get_warm_path_note',
];

const WRITE_TOOL_NAMES = ['update_master_profile', 'update_connection_edge', 'update_warm_path'];

describe('toolsForPermissions', () => {
  const masterProfiles = {
    lookup: jest.fn(),
    getByUid: jest.fn(),
  } as unknown as MasterProfileService;
  const warmIntros = {
    listPaths: jest.fn(),
    getPathsByInvestor: jest.fn(),
  } as unknown as WarmIntrosV2Service;
  const catalog = [WHOAMI_TOOL, ...warmIntroTools(masterProfiles, warmIntros)];

  it('always includes whoami', async () => {
    const tools = toolsForPermissions(new Set(), catalog);
    expect(tools.map((t) => t.name)).toEqual(['whoami']);
    const result = await WHOAMI_TOOL.execute({
      memberUid: 'm1',
      name: 'Ada',
      email: 'ada@example.com',
      permissions: new Set(),
      authorizationUid: 'auth-1',
      clientName: 'Claude Code',
      agentAccess: 'write' as const,
    });
    expect(result).toEqual({ memberUid: 'm1', name: 'Ada', email: 'ada@example.com', agentAccess: 'write' });
  });

  it('omits Warm Intro tools without investor_db.view', () => {
    const without = toolsForPermissions(new Set(['mcp.connect']), catalog);
    const withView = toolsForPermissions(new Set(['mcp.connect', 'investor_db.view']), catalog);
    expect(without.map((t) => t.name)).toEqual(['whoami']);
    expect(withView.map((t) => t.name)).toEqual(WARM_INTRO_TOOL_NAMES);
  });

  it('shows Warm Intro tools with directory.admin.full', () => {
    const tools = toolsForPermissions(new Set(['directory.admin.full']), catalog);
    expect(tools.map((t) => t.name)).toEqual([...WARM_INTRO_TOOL_NAMES, ...WRITE_TOOL_NAMES]);
  });

  it('hides field-lock tools without investor_db.edit', () => {
    const viewOnly = toolsForPermissions(new Set(['mcp.connect', 'investor_db.view']), catalog);
    expect(viewOnly.map((t) => t.name)).toEqual(WARM_INTRO_TOOL_NAMES);
  });

  it('shows field-lock tools with investor_db.edit', () => {
    const editOnly = toolsForPermissions(new Set(['investor_db.edit']), catalog);
    expect(editOnly.map((t) => t.name)).toEqual(['whoami', ...WRITE_TOOL_NAMES]);
  });
});

describe('scope registry', () => {
  const stub = {} as any;
  const fullCatalog = [
    WHOAMI_TOOL,
    ...warmIntroTools(stub, stub),
    ...directoryTools(stub, stub, stub, stub, stub),
    ...aiAppFeedbackTools(stub),
    ...aiAppWriteTools(stub),
    ...portfolioTools(stub),
    ...newsTools(stub, stub),
    ...newsWriteTools(stub, stub, stub),
    ...profileTools(stub, stub, stub),
    ...membershipTools(stub, stub, stub),
    ...experienceTools(stub, stub),
    ...followTools(stub),
    ...savedJobTools(stub),
    ...jobAlertTools(stub, stub),
    ...emailPreferenceTools(stub, stub, stub, stub, stub),
    ...demoDaySaveTools(stub, stub, stub),
    ...eventWriteTools(stub, stub, stub, stub),
    ...directoryWriteTools(stub, stub, stub, stub),
  ];
  const everything = new Set(['directory.admin.full', 'investor_db.edit', 'forum.read', 'ai_apps.read']);

  it('puts every catalog tool except whoami in the scope registry', () => {
    const missing = fullCatalog
      .map((t) => t.name)
      .filter((name) => !MCP_UNSCOPED_TOOLS.has(name) && !MCP_TOOL_SCOPES[name]);
    expect(missing).toEqual([]);
  });

  it('registers no tool that is not in the catalog', () => {
    const names = new Set(fullCatalog.map((t) => t.name));
    expect(Object.keys(MCP_TOOL_SCOPES).filter((name) => !names.has(name))).toEqual([]);
  });

  it('marks every tool that changes data as a write tool', () => {
    const writesByName = fullCatalog
      .map((t) => t.name)
      .filter((name) =>
        /^(update|submit|post|rsvp|cancel|join|leave|add|delete|follow|unfollow|save|unsave|set|redeploy|rename)_/.test(
          name
        )
      );
    expect(writesByName.length).toBeGreaterThan(0);
    for (const name of writesByName) {
      expect(isWriteTool(name)).toBe(true);
    }
    expect(
      fullCatalog
        .map((t) => t.name)
        .filter(isWriteTool)
        .sort()
    ).toEqual(writesByName.sort());
  });

  it('allows write only on scopes that have write tools', () => {
    for (const scope of ['investors', 'ai_apps', 'news', 'profile', 'events', 'directory'] as const) {
      expect(registryMaxLevel(scope)).toBe('write');
    }
    for (const scope of ['search', 'forum'] as const) {
      expect(registryMaxLevel(scope)).toBe('read');
    }
  });

  it('keeps RBAC visibility independent of scopes', () => {
    expect(toolsForPermissions(everything, fullCatalog).map((t) => t.name)).toEqual(fullCatalog.map((t) => t.name));
  });

  it('reports the grant level from whoami', async () => {
    const result = await WHOAMI_TOOL.execute({
      memberUid: 'm1',
      name: 'Ada',
      email: null,
      permissions: new Set(),
      authorizationUid: 'auth-1',
      clientName: 'Claude Code',
      agentAccess: 'read',
    });
    expect(result).toMatchObject({ agentAccess: 'read' });
  });
});

describe('field lock tools', () => {
  const actor = {
    memberUid: 'm1',
    name: 'Ada',
    email: 'ada@example.com',
    permissions: new Set(['investor_db.edit']),
    authorizationUid: 'auth-1',
    clientName: 'Claude Code',
    agentAccess: 'write' as const,
  };

  it('locks master profile fields for the signed-in member', async () => {
    const patchFields = jest.fn().mockResolvedValue({ uid: 'u1', locked: ['bio'], unlocked: [], row: { uid: 'u1' } });
    const tool = warmIntroTools({ patchFields } as unknown as MasterProfileService, {} as WarmIntrosV2Service).find(
      (item) => item.name === 'update_master_profile'
    );

    const result = await tool?.execute(actor, { uid: ' u1 ', fields: { bio: 'Ada' } });

    expect(patchFields).toHaveBeenCalledWith(
      'u1',
      { bio: 'Ada' },
      { source: 'mcp', actorUid: 'm1', actorEmail: 'ada@example.com' }
    );
    expect(result).toEqual({ uid: 'u1', locked: ['bio'], unlocked: [], row: { uid: 'u1' } });
  });

  it('rejects a missing fields object', async () => {
    const patchFields = jest.fn();
    const tool = warmIntroTools({ patchFields } as unknown as MasterProfileService, {} as WarmIntrosV2Service).find(
      (item) => item.name === 'update_master_profile'
    );

    await expect(tool?.execute(actor, { uid: 'u1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(patchFields).not.toHaveBeenCalled();
  });
});

describe('searchMasterProfiles', () => {
  it('returns compact rows only', async () => {
    const lookup = jest.fn().mockResolvedValue({
      profiles: [
        {
          uid: 'u1',
          canonicalName: 'Jane',
          currentOrg: 'a16z',
          currentTitle: 'Partner',
          types: ['investor'],
          raw: { secret: true },
          sourceSnapshots: [{ a: 1 }],
        },
      ],
      limit: 20,
      offset: 0,
    });
    const result = await searchMasterProfiles({ lookup } as unknown as MasterProfileService, {
      name: 'Jane',
      currentOrg: 'a16z',
    });
    expect(lookup).toHaveBeenCalledWith({
      name: 'Jane',
      email: undefined,
      type: undefined,
      currentOrg: 'a16z',
      limit: '20',
      offset: '0',
    });
    expect(result).toEqual({
      profiles: [
        {
          uid: 'u1',
          canonicalName: 'Jane',
          currentOrg: 'a16z',
          currentTitle: 'Partner',
          types: ['investor'],
        },
      ],
      limit: 20,
      offset: 0,
    });
    expect(JSON.stringify(result)).not.toContain('raw');
    expect(compactMasterProfile({ uid: 'u1', canonicalName: 'Jane', raw: {} })).toEqual({
      uid: 'u1',
      canonicalName: 'Jane',
      currentOrg: null,
      currentTitle: null,
      types: [],
    });
  });
});

describe('getMasterProfile', () => {
  it('returns the full row from getByUid', async () => {
    const profile = { uid: 'u1', canonicalName: 'Jane', raw: { secret: true } };
    const getByUid = jest.fn().mockResolvedValue(profile);
    await expect(getMasterProfile({ getByUid } as unknown as MasterProfileService, { uid: 'u1' })).resolves.toEqual(
      profile
    );
    expect(getByUid).toHaveBeenCalledWith('u1');
  });

  it('propagates not-found', async () => {
    const getByUid = jest.fn().mockRejectedValue(new NotFoundException('MasterProfile not found: missing'));
    await expect(
      getMasterProfile({ getByUid } as unknown as MasterProfileService, { uid: 'missing' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

const listPathRow = {
  uid: 'p1',
  targetProfileUid: 'inv1',
  targetSet: 'neuro-fund-i',
  rank: 1,
  score: 0.82,
  hopCount: 1,
  hopChain: { relationKind: 'pl_direct', hops: [] },
  bestConnectorProfileUid: 'from1',
  alternateConnectorProfileUids: ['alt1'],
  scorePercent: 82,
  scoreBand: 'green',
  investor: {
    profileUid: 'inv1',
    name: 'Vitalik',
    currentOrg: 'Ethereum',
    email: 'vitalik@ethereum.org',
  },
  bestConnector: { profileUid: 'from1', name: 'Juan Benet', currentOrg: 'PL' },
  pathSummary: { explanation: 'Direct PL intro', alternateCount: 1 },
};

describe('searchWarmIntroInvestors', () => {
  it('returns compact rows only', async () => {
    const listPaths = jest.fn().mockResolvedValue({ paths: [listPathRow], total: 1 });
    const result = await searchWarmIntroInvestors({ listPaths } as unknown as WarmIntrosV2Service, {
      search: 'vitalik',
      targetSet: 'neuro-fund-i',
      connectorProfileUid: 'from1',
      sector: 'crypto',
      relationKind: 'pl_direct',
      bridgeProfileUid: 'bridge1',
      plBacker: true,
    });
    expect(listPaths).toHaveBeenCalledWith({
      targetSet: 'neuro-fund-i',
      search: 'vitalik',
      connectorProfileUid: 'from1',
      sector: 'crypto',
      relationKind: 'pl_direct',
      bridgeProfileUid: 'bridge1',
      plBacker: 'true',
      limit: '20',
      offset: '0',
    });
    expect(result).toEqual({
      investors: [
        {
          profileUid: 'inv1',
          name: 'Vitalik',
          currentOrg: 'Ethereum',
          score: 0.82,
          scorePercent: 82,
          scoreBand: 'green',
          bestConnector: { profileUid: 'from1', name: 'Juan Benet' },
          path: { explanation: 'Direct PL intro', hopCount: 1, relationKind: 'pl_direct' },
          targetSet: 'neuro-fund-i',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    expect(JSON.stringify(result)).not.toContain('hopChain');
    expect(JSON.stringify(result)).not.toContain('alternateConnectorProfileUids');
    expect(compactWarmIntroInvestor({ targetProfileUid: 'inv1', hopChain: {}, pathSummary: {} })).toEqual({
      profileUid: 'inv1',
      name: null,
      currentOrg: null,
      score: undefined,
      scorePercent: undefined,
      scoreBand: null,
      bestConnector: null,
      path: { explanation: null, hopCount: undefined, relationKind: 'pl_direct' },
      targetSet: undefined,
    });
  });
});

describe('getWarmIntroInvestor', () => {
  it('returns investor summary plus all paths', async () => {
    const payload = { investor: { profileUid: 'inv1', name: 'Vitalik' }, paths: [listPathRow] };
    const getPathsByInvestor = jest.fn().mockResolvedValue(payload);
    await expect(
      getWarmIntroInvestor({ getPathsByInvestor } as unknown as WarmIntrosV2Service, {
        profileUid: 'inv1',
        targetSet: 'neuro-fund-i',
      })
    ).resolves.toEqual(payload);
    expect(getPathsByInvestor).toHaveBeenCalledWith('inv1', { targetSet: 'neuro-fund-i' });
  });

  it('throws not-found when there are no warm paths', async () => {
    const getPathsByInvestor = jest.fn().mockResolvedValue({
      investor: { profileUid: 'missing', name: 'missing' },
      paths: [],
    });
    await expect(
      getWarmIntroInvestor({ getPathsByInvestor } as unknown as WarmIntrosV2Service, { profileUid: 'missing' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

const mcpActor = {
  memberUid: 'm1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(['investor_db.view']),
  authorizationUid: 'auth-1',
  clientName: 'Claude Code',
  agentAccess: 'write' as const,
};

describe('submitWarmPathFeedback', () => {
  it('upserts note only for the MCP actor', async () => {
    const upsertPathFeedback = jest.fn().mockResolvedValue({
      uid: 'f1',
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      canRefer: 'yes',
      note: 'Wrong path',
      actorUid: 'm1',
      actorEmail: 'ada@example.com',
      updatedAt: '2026-07-28T00:00:00.000Z',
    });
    const result = await submitWarmPathFeedback({ upsertPathFeedback } as unknown as WarmIntrosV2Service, mcpActor, {
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: 'Wrong path',
    });
    expect(upsertPathFeedback).toHaveBeenCalledWith(
      'p1',
      { connectorProfileUid: 'from1', note: 'Wrong path' },
      { uid: 'm1', email: 'ada@example.com' }
    );
    expect(result).toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: 'Wrong path',
      updatedAt: '2026-07-28T00:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('canRefer');
  });

  it('clears the note when note is null', async () => {
    const upsertPathFeedback = jest.fn().mockResolvedValue({ deleted: true });
    const result = await submitWarmPathFeedback({ upsertPathFeedback } as unknown as WarmIntrosV2Service, mcpActor, {
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
    });
    expect(upsertPathFeedback).toHaveBeenCalledWith(
      'p1',
      { connectorProfileUid: 'from1', note: null },
      { uid: 'm1', email: 'ada@example.com' }
    );
    expect(result).toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
      updatedAt: null,
    });
    expect(JSON.stringify(result)).not.toContain('canRefer');
    expect(compactOwnPathFeedback('p1', 'from1', { deleted: true, canRefer: 'yes' })).toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
      updatedAt: null,
    });
  });
});

describe('getWarmPathFeedback', () => {
  it("returns this member's own note", async () => {
    const payload = {
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: 'Wrong path',
      updatedAt: '2026-07-28T00:00:00.000Z',
    };
    const getMyPathFeedback = jest.fn().mockResolvedValue(payload);
    await expect(
      getWarmPathFeedback({ getMyPathFeedback } as unknown as WarmIntrosV2Service, mcpActor, {
        warmPathUid: 'p1',
        connectorProfileUid: 'from1',
      })
    ).resolves.toEqual(payload);
    expect(getMyPathFeedback).toHaveBeenCalledWith('p1', 'from1', { uid: 'm1', email: 'ada@example.com' });
    expect(JSON.stringify(payload)).not.toContain('canRefer');
  });

  it('returns empty when this member has no note', async () => {
    const getMyPathFeedback = jest.fn().mockResolvedValue({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
      updatedAt: null,
    });
    await expect(
      getWarmPathFeedback({ getMyPathFeedback } as unknown as WarmIntrosV2Service, mcpActor, {
        warmPathUid: 'p1',
        connectorProfileUid: 'from1',
      })
    ).resolves.toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
      updatedAt: null,
    });
  });

  it('propagates not-found', async () => {
    const getMyPathFeedback = jest.fn().mockRejectedValue(new NotFoundException('WarmPathV2 not found: missing'));
    await expect(
      getWarmPathFeedback({ getMyPathFeedback } as unknown as WarmIntrosV2Service, mcpActor, {
        warmPathUid: 'missing',
        connectorProfileUid: 'from1',
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('submitWarmPathNote', () => {
  it('upserts note only for the MCP actor', async () => {
    const upsertPathNote = jest.fn().mockResolvedValue({
      uid: 'n1',
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: 'Waiting on a reply',
      actorUid: 'm1',
      actorEmail: 'ada@example.com',
      updatedAt: '2026-08-19T00:00:00.000Z',
    });
    const result = await submitWarmPathNote({ upsertPathNote } as unknown as WarmIntrosV2Service, mcpActor, {
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: 'Waiting on a reply',
    });
    expect(upsertPathNote).toHaveBeenCalledWith(
      'p1',
      { connectorProfileUid: 'from1', note: 'Waiting on a reply' },
      { uid: 'm1', email: 'ada@example.com' }
    );
    expect(result).toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: 'Waiting on a reply',
      updatedAt: '2026-08-19T00:00:00.000Z',
    });
  });

  it('clears the note when note is null', async () => {
    const upsertPathNote = jest.fn().mockResolvedValue({ deleted: true });
    const result = await submitWarmPathNote({ upsertPathNote } as unknown as WarmIntrosV2Service, mcpActor, {
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
    });
    expect(upsertPathNote).toHaveBeenCalledWith(
      'p1',
      { connectorProfileUid: 'from1', note: null },
      { uid: 'm1', email: 'ada@example.com' }
    );
    expect(result).toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
      updatedAt: null,
    });
  });
});

describe('getWarmPathNote', () => {
  it("returns this member's own note", async () => {
    const payload = {
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: 'Waiting on a reply',
      updatedAt: '2026-08-19T00:00:00.000Z',
    };
    const getMyPathNote = jest.fn().mockResolvedValue(payload);
    await expect(
      getWarmPathNote({ getMyPathNote } as unknown as WarmIntrosV2Service, mcpActor, {
        warmPathUid: 'p1',
        connectorProfileUid: 'from1',
      })
    ).resolves.toEqual(payload);
    expect(getMyPathNote).toHaveBeenCalledWith('p1', 'from1', { uid: 'm1', email: 'ada@example.com' });
  });

  it('returns empty when this member has no note', async () => {
    const getMyPathNote = jest.fn().mockResolvedValue({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
      updatedAt: null,
    });
    await expect(
      getWarmPathNote({ getMyPathNote } as unknown as WarmIntrosV2Service, mcpActor, {
        warmPathUid: 'p1',
        connectorProfileUid: 'from1',
      })
    ).resolves.toEqual({
      warmPathUid: 'p1',
      connectorProfileUid: 'from1',
      note: null,
      updatedAt: null,
    });
  });

  it('propagates not-found', async () => {
    const getMyPathNote = jest.fn().mockRejectedValue(new NotFoundException('WarmPathV2 not found: missing'));
    await expect(
      getWarmPathNote({ getMyPathNote } as unknown as WarmIntrosV2Service, mcpActor, {
        warmPathUid: 'missing',
        connectorProfileUid: 'from1',
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
