import axios from 'axios';
import { LinearApiError, LinearClient } from './linear.client';

// A factory keeps Jest from loading axios's ESM build.
jest.mock('axios', () => ({ create: jest.fn() }));

const TOKEN_URL = 'https://api.linear.app/oauth/token';

describe('LinearClient', () => {
  const post = jest.fn();
  const envKeys = [
    'FEEDBACK_LINEAR_CLIENT_ID',
    'FEEDBACK_LINEAR_CLIENT_SECRET',
    'FEEDBACK_LINEAR_PLATFORM_TEAM_ID',
    'FEEDBACK_LINEAR_PLATFORM_STATE_ID',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.restoreAllMocks();
    post.mockReset();
    (axios.create as jest.Mock).mockReturnValue({ post });
    for (const key of envKeys) saved[key] = process.env[key];
    process.env.FEEDBACK_LINEAR_CLIENT_ID = 'client-id';
    process.env.FEEDBACK_LINEAR_CLIENT_SECRET = 'super-secret';
    process.env.FEEDBACK_LINEAR_PLATFORM_TEAM_ID = 'team';
    process.env.FEEDBACK_LINEAR_PLATFORM_STATE_ID = 'state';
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function tokenResponse(token = 'tok-1', expiresIn = 3600) {
    return { status: 200, data: { access_token: token, expires_in: expiresIn } };
  }

  function gqlResponse(data: unknown) {
    return { status: 200, data: { data }, headers: {} };
  }

  function httpError(status: number, data: unknown = {}, headers: Record<string, string> = {}) {
    return Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      response: { status, data, headers },
    });
  }

  function graphqlCalls() {
    return post.mock.calls.filter(([url]) => url !== TOKEN_URL);
  }

  function tokenCalls() {
    return post.mock.calls.filter(([url]) => url === TOKEN_URL);
  }

  it('fetches a client-credentials token and sends it as a bearer token', async () => {
    post
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(gqlResponse({ issue: { id: 'i1', identifier: 'LAB-1', url: 'u' } }));
    const client = new LinearClient();

    await expect(client.issueById('i1')).resolves.toEqual({ id: 'i1', identifier: 'LAB-1', url: 'u' });

    const [, body] = tokenCalls()[0];
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_id=client-id');
    expect(body).toContain('scope=read%2Cwrite');
    expect(graphqlCalls()[0][2].headers.Authorization).toBe('Bearer tok-1');
  });

  it('caches the token across calls', async () => {
    post
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValue(gqlResponse({ issue: { id: 'i1', identifier: 'LAB-1', url: 'u' } }));
    const client = new LinearClient();

    await client.issueById('i1');
    await client.issueById('i1');

    expect(tokenCalls()).toHaveLength(1);
  });

  it('refreshes the token five minutes before it expires', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-15T00:00:00Z'));
    post
      .mockResolvedValueOnce(tokenResponse('tok-1', 600))
      .mockResolvedValueOnce(gqlResponse({ issue: null }))
      .mockResolvedValueOnce(tokenResponse('tok-2', 600))
      .mockResolvedValueOnce(gqlResponse({ issue: null }));
    const client = new LinearClient();

    await client.issueById('a');
    now.mockReturnValue(Date.parse('2026-10-15T00:05:01Z'));
    await client.issueById('b');

    expect(tokenCalls()).toHaveLength(2);
    expect(graphqlCalls()[1][2].headers.Authorization).toBe('Bearer tok-2');
  });

  it('refetches the token once and retries on a 401', async () => {
    post
      .mockResolvedValueOnce(tokenResponse('stale'))
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce(tokenResponse('fresh'))
      .mockResolvedValueOnce(gqlResponse({ issue: { id: 'i1', identifier: 'LAB-1', url: 'u' } }));
    const client = new LinearClient();

    await expect(client.issueById('i1')).resolves.toMatchObject({ identifier: 'LAB-1' });
    expect(graphqlCalls()[1][2].headers.Authorization).toBe('Bearer fresh');
  });

  it('refetches the token on an AUTHENTICATION_ERROR GraphQL error', async () => {
    post
      .mockResolvedValueOnce(tokenResponse('stale'))
      .mockResolvedValueOnce({
        status: 400,
        data: { errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }] },
        headers: {},
      })
      .mockResolvedValueOnce(tokenResponse('fresh'))
      .mockResolvedValueOnce(gqlResponse({ issue: null }));
    const client = new LinearClient();

    await expect(client.issueById('i1')).resolves.toBeNull();
    expect(tokenCalls()).toHaveLength(2);
  });

  it('maps a 429 with Retry-After to a retryable error with a wait time', async () => {
    post.mockResolvedValueOnce(tokenResponse()).mockRejectedValueOnce(httpError(429, {}, { 'retry-after': '120' }));
    const client = new LinearClient();

    const error = await client.teamLabels('t').catch((e) => e);
    expect(error).toBeInstanceOf(LinearApiError);
    expect(error).toMatchObject({ status: 429, retryable: true, retryAfterMs: 120_000 });
  });

  it('maps a RATELIMITED GraphQL error using the reset header', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    post
      .mockResolvedValueOnce(tokenResponse())
      .mockRejectedValueOnce(
        httpError(
          400,
          { errors: [{ message: 'Rate limit exceeded', extensions: { code: 'RATELIMITED' } }] },
          { 'x-ratelimit-requests-reset': String(1_000_000 + 30_000) }
        )
      );
    const client = new LinearClient();

    const error = await client.teamLabels('t').catch((e) => e);
    expect(error).toMatchObject({ code: 'RATELIMITED', retryable: true, retryAfterMs: 30_000 });
  });

  it('maps a 5xx to a retryable error', async () => {
    post.mockResolvedValueOnce(tokenResponse()).mockRejectedValueOnce(httpError(503));
    const error = await new LinearClient().teamLabels('t').catch((e) => e);
    expect(error).toMatchObject({ status: 503, retryable: true });
  });

  it('maps a network error to a retryable error with status 0', async () => {
    post
      .mockResolvedValueOnce(tokenResponse())
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
    const error = await new LinearClient().teamLabels('t').catch((e) => e);
    expect(error).toMatchObject({ status: 0, retryable: true });
  });

  it('maps an input validation error to a non-retryable error', async () => {
    post.mockResolvedValueOnce(tokenResponse()).mockRejectedValueOnce(
      httpError(400, {
        errors: [{ message: 'Argument Validation Error', extensions: { code: 'INVALID_INPUT' } }],
      })
    );
    const error = await new LinearClient().teamLabels('t').catch((e) => e);
    expect(error).toMatchObject({ status: 400, code: 'INVALID_INPUT', retryable: false });
  });

  it('returns null from issueById when Linear says the entity is not found', async () => {
    post.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      status: 200,
      data: { errors: [{ message: 'Entity not found: Issue' }] },
      headers: {},
    });
    await expect(new LinearClient().issueById('missing')).resolves.toBeNull();
  });

  it('creates an issue and returns its reference', async () => {
    post
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        gqlResponse({ issueCreate: { success: true, issue: { id: 'i1', identifier: 'LAB-9', url: 'u' } } })
      );
    const client = new LinearClient();

    const input = { id: 'i1', teamId: 't', title: 'x', description: 'y', stateId: 's' };
    await expect(client.issueCreate(input)).resolves.toEqual({ id: 'i1', identifier: 'LAB-9', url: 'u' });
    expect(graphqlCalls()[0][1].variables).toEqual({ input });
  });

  it('flags an "already exists" error', async () => {
    post.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      status: 200,
      data: { errors: [{ message: 'Entity already exists' }] },
      headers: {},
    });
    const error = await new LinearClient()
      .issueCreate({ id: 'i1', teamId: 't', title: 'x', description: 'y', stateId: 's' })
      .catch((e) => e);
    expect(error.isAlreadyExists).toBe(true);
  });

  it('flattens team labels with their parent group name', async () => {
    post.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      gqlResponse({
        team: {
          labels: {
            nodes: [
              { id: 'l1', name: 'Bug', parent: { name: 'Type' } },
              { id: 'l2', name: 'User feedback', parent: null },
            ],
          },
        },
      })
    );
    await expect(new LinearClient().teamLabels('t')).resolves.toEqual([
      { id: 'l1', name: 'Bug', parentName: 'Type' },
      { id: 'l2', name: 'User feedback', parentName: null },
    ]);
  });

  it('never puts the token or client secret into error messages', async () => {
    post
      .mockResolvedValueOnce(tokenResponse('tok-secret-value'))
      .mockRejectedValueOnce(httpError(500, { error: 'boom' }))
      .mockRejectedValueOnce(httpError(401, { error: 'invalid_client' }));
    const client = new LinearClient();

    const first = await client.teamLabels('t').catch((e) => e);
    const second = await new LinearClient().teamLabels('t').catch((e) => e);
    for (const error of [first, second]) {
      expect(error.message).not.toContain('tok-secret-value');
      expect(error.message).not.toContain('super-secret');
    }
  });

  it('fails without calling Linear when it is not configured', async () => {
    delete process.env.FEEDBACK_LINEAR_CLIENT_ID;
    const error = await new LinearClient().teamLabels('t').catch((e) => e);
    expect(error).toMatchObject({ message: 'Linear is not configured', retryable: false });
    expect(post).not.toHaveBeenCalled();
  });
});
