import { isLoopbackRedirectUri, isRegisteredRedirectUri } from './mcp-redirect';
import { pkceS256Challenge, verifyPkceS256 } from './mcp.crypto';
import { toolsForPermissions, WHOAMI_TOOL, type McpToolDef } from './mcp-tools';

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
  const warmIntro: McpToolDef = {
    name: 'search_master_profiles',
    description: 'later ticket',
    visibility: 'investor_db',
    execute: async () => ({}),
  };

  it('always includes whoami', async () => {
    const tools = toolsForPermissions(new Set(), [WHOAMI_TOOL, warmIntro]);
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
    const without = toolsForPermissions(new Set(['mcp.connect']), [WHOAMI_TOOL, warmIntro]);
    const withView = toolsForPermissions(new Set(['mcp.connect', 'investor_db.view']), [WHOAMI_TOOL, warmIntro]);
    expect(without.map((t) => t.name)).toEqual(['whoami']);
    expect(withView.map((t) => t.name)).toEqual(['whoami', 'search_master_profiles']);
  });
});
