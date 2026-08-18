import { NotFoundException } from '@nestjs/common';
import { isLoopbackRedirectUri, isRegisteredRedirectUri } from './mcp-redirect';
import { pkceS256Challenge, verifyPkceS256 } from './mcp.crypto';
import {
  compactMasterProfile,
  compactOwnPathFeedback,
  compactWarmIntroInvestor,
  getMasterProfile,
  getWarmIntroInvestor,
  getWarmPathFeedback,
  searchMasterProfiles,
  searchWarmIntroInvestors,
  submitWarmPathFeedback,
  toolsForPermissions,
  warmIntroTools,
  WHOAMI_TOOL,
} from './mcp-tools';
import { MasterProfileService } from '../master-profile/master-profile.service';
import { WarmIntrosV2Service } from '../warm-intros-v2/warm-intros-v2.service';

describe('mcp-redirect', () => {
  it('allows localhost and 127.0.0.1 only', () => {
    expect(isLoopbackRedirectUri('http://127.0.0.1:9/cb')).toBe(true);
    expect(isLoopbackRedirectUri('http://localhost:9/cb')).toBe(true);
    expect(isLoopbackRedirectUri('https://labos.example/cb')).toBe(false);
  });

  it('requires the URI to be registered', () => {
    const registered = ['http://127.0.0.1:9/cb'];
    expect(isRegisteredRedirectUri('http://127.0.0.1:9/cb', registered)).toBe(true);
    expect(isRegisteredRedirectUri('http://127.0.0.1:8/cb', registered)).toBe(false);
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
];

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
    });
    expect(result).toEqual({ memberUid: 'm1', name: 'Ada', email: 'ada@example.com' });
  });

  it('omits Warm Intro tools without investor_db.view', () => {
    const without = toolsForPermissions(new Set(['mcp.connect']), catalog);
    const withView = toolsForPermissions(new Set(['mcp.connect', 'investor_db.view']), catalog);
    expect(without.map((t) => t.name)).toEqual(['whoami']);
    expect(withView.map((t) => t.name)).toEqual(WARM_INTRO_TOOL_NAMES);
  });

  it('shows Warm Intro tools with directory.admin.full', () => {
    const tools = toolsForPermissions(new Set(['directory.admin.full']), catalog);
    expect(tools.map((t) => t.name)).toEqual(WARM_INTRO_TOOL_NAMES);
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
