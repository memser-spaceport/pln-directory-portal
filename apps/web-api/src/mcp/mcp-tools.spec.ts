import { NotFoundException } from '@nestjs/common';
import { isLoopbackRedirectUri, isRegisteredRedirectUri } from './mcp-redirect';
import { pkceS256Challenge, verifyPkceS256 } from './mcp.crypto';
import {
  compactMasterProfile,
  getMasterProfile,
  searchMasterProfiles,
  toolsForPermissions,
  warmIntroTools,
  WHOAMI_TOOL,
} from './mcp-tools';
import { MasterProfileService } from '../master-profile/master-profile.service';

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

describe('toolsForPermissions', () => {
  const masterProfiles = {
    lookup: jest.fn(),
    getByUid: jest.fn(),
  } as unknown as MasterProfileService;
  const catalog = [WHOAMI_TOOL, ...warmIntroTools(masterProfiles)];

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
    expect(withView.map((t) => t.name)).toEqual(['whoami', 'search_master_profiles', 'get_master_profile']);
  });

  it('shows Warm Intro tools with directory.admin.full', () => {
    const tools = toolsForPermissions(new Set(['directory.admin.full']), catalog);
    expect(tools.map((t) => t.name)).toEqual(['whoami', 'search_master_profiles', 'get_master_profile']);
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
