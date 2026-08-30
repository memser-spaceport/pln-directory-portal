import { promises as fs } from 'fs';
import { AnthropicAuth } from './anthropic-auth';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

describe('AnthropicAuth', () => {
  const ORIGINAL_ENV = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.ANTHROPIC_AUTH_MODE = 'wif';
    process.env.ANTHROPIC_IDENTITY_TOKEN_FILE = '/tmp/anthropic-token';
    process.env.ANTHROPIC_FEDERATION_RULE_ID = 'fdrl_test';
    process.env.ANTHROPIC_ORGANIZATION_ID = 'org-test';
    process.env.ANTHROPIC_SERVICE_ACCOUNT_ID = 'svac_test';
    process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_test';
    (fs.readFile as jest.Mock).mockResolvedValue('projected-jwt\n');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults to API-key authentication', () => {
    delete process.env.ANTHROPIC_AUTH_MODE;
    const auth = new AnthropicAuth();
    expect(auth.mode).toBe('api_key');
  });

  it('exchanges the projected identity token and caches the access token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ access_token: 'wif-access-token', expires_in: 600 }),
    }) as unknown as typeof fetch;

    const auth = new AnthropicAuth();
    await expect(auth.getWifAccessToken()).resolves.toBe('wif-access-token');
    await expect(auth.getWifAccessToken()).resolves.toBe('wif-access-token');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse(init.body);
    expect(requestBody).toMatchObject({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: 'projected-jwt',
      federation_rule_id: 'fdrl_test',
      organization_id: 'org-test',
      service_account_id: 'svac_test',
      workspace_id: 'wrkspc_test',
    });
    expect(requestBody).not.toHaveProperty('subject_token');
    expect(requestBody).not.toHaveProperty('subject_token_type');
  });

  it('replaces x-api-key with a WIF bearer token in the AI SDK fetch wrapper', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ access_token: 'wif-access-token', expires_in: 600 }),
      })
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const auth = new AnthropicAuth();
    const wifFetch = auth.createWifFetch();
    await wifFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'wif-managed', 'content-type': 'application/json' },
      body: '{}',
    });

    const [, apiInit] = fetchMock.mock.calls[1];
    const headers = new Headers(apiInit.headers);
    expect(headers.has('x-api-key')).toBe(false);
    expect(headers.get('authorization')).toBe('Bearer wif-access-token');
  });
});
