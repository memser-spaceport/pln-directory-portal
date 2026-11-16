import {
  DIGEST_LINK_MAX_AGE_SECONDS,
  DigestLinkError,
  issueDigestLinkToken,
  verifyDigestLinkToken,
} from './labos-digest-link-token.util';

/**
 * Fixed vector shared with pl-notification-service (LAB-3265): the same secret and payload, serialised with
 * the keys in this order (purpose, m, f, s, n, l, p, iat), must give exactly this token there.
 * Computed with plain node:crypto, not with this util.
 */
const VECTOR = {
  secret: 'digest-link-test-secret',
  payload: {
    m: 'cm-member-1',
    f: 'daily' as const,
    s: '2026-11-16T09:00:00.000Z',
    n: ['news-b', 'news-a', 'news-c'],
    l: 'news-b',
    p: [101, 102],
  },
  iat: 1763283600,
  token:
    'v1.eyJwdXJwb3NlIjoiZGlnZXN0IiwibSI6ImNtLW1lbWJlci0xIiwiZiI6ImRhaWx5IiwicyI6IjIwMjYtMTEtMTZUMDk6MDA6MDAuMDAwWiIsIm4iOlsibmV3cy1iIiwibmV3cy1hIiwibmV3cy1jIl0sImwiOiJuZXdzLWIiLCJwIjpbMTAxLDEwMl0sImlhdCI6MTc2MzI4MzYwMH0.w8SOyedllelo39DQrxPHy-VcEAFEgYrsxTJ2qmN0Lbs',
};

const reasonOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (err) {
    return err instanceof DigestLinkError ? err.reason : 'other';
  }
  return undefined;
};

describe('labos-digest-link-token.util', () => {
  const ORIGINAL = process.env.DIGEST_LINK_SECRET;

  beforeEach(() => {
    process.env.DIGEST_LINK_SECRET = VECTOR.secret;
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.DIGEST_LINK_SECRET;
    else process.env.DIGEST_LINK_SECRET = ORIGINAL;
  });

  it('issues exactly the shared test vector', () => {
    expect(issueDigestLinkToken(VECTOR.payload, VECTOR.iat * 1000)).toBe(VECTOR.token);
  });

  it('verifies the shared test vector', () => {
    const payload = verifyDigestLinkToken(VECTOR.token, DIGEST_LINK_MAX_AGE_SECONDS, (VECTOR.iat + 10) * 1000);
    expect(payload).toEqual({ purpose: 'digest', ...VECTOR.payload, iat: VECTOR.iat });
  });

  it('round-trips a token without a top story or posts', () => {
    const token = issueDigestLinkToken({ m: 'm1', f: 'weekly', s: '2026-11-16T09:00:00Z', n: ['a'], p: [] });
    const payload = verifyDigestLinkToken(token);
    expect(payload.l).toBeUndefined();
    expect(payload.n).toEqual(['a']);
  });

  it('rejects a changed body with the old signature', () => {
    const [v, body, sig] = VECTOR.token.split('.');
    const changed = `${v}.${body.slice(0, -2)}${body.slice(-2) === 'fQ' ? 'fR' : 'fQ'}.${sig}`;
    expect(reasonOf(() => verifyDigestLinkToken(changed, DIGEST_LINK_MAX_AGE_SECONDS, VECTOR.iat * 1000))).toBe(
      'signature'
    );
  });

  it('rejects a changed signature', () => {
    const token = `${VECTOR.token.slice(0, -1)}${VECTOR.token.endsWith('A') ? 'B' : 'A'}`;
    expect(reasonOf(() => verifyDigestLinkToken(token, DIGEST_LINK_MAX_AGE_SECONDS, VECTOR.iat * 1000))).toBe(
      'signature'
    );
  });

  it('rejects a token signed with another secret', () => {
    process.env.DIGEST_LINK_SECRET = 'another-secret';
    expect(reasonOf(() => verifyDigestLinkToken(VECTOR.token, DIGEST_LINK_MAX_AGE_SECONDS, VECTOR.iat * 1000))).toBe(
      'signature'
    );
  });

  it('rejects a token older than 90 days', () => {
    const now = (VECTOR.iat + 91 * 24 * 60 * 60) * 1000;
    expect(reasonOf(() => verifyDigestLinkToken(VECTOR.token, DIGEST_LINK_MAX_AGE_SECONDS, now))).toBe('expired');
  });

  it('accepts a token 89 days old', () => {
    const now = (VECTOR.iat + 89 * 24 * 60 * 60) * 1000;
    expect(() => verifyDigestLinkToken(VECTOR.token, DIGEST_LINK_MAX_AGE_SECONDS, now)).not.toThrow();
  });

  it('rejects another purpose even with a valid signature', () => {
    // A well-formed token of the same format but for another purpose.
    const body = Buffer.from(JSON.stringify({ purpose: 'unsubscribe', m: 'm1', iat: VECTOR.iat }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createHmac } = require('crypto');
    const sig = createHmac('sha256', VECTOR.secret)
      .update(`v1.${body}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(reasonOf(() => verifyDigestLinkToken(`v1.${body}.${sig}`))).toBe('purpose');
  });

  it('rejects malformed tokens', () => {
    expect(reasonOf(() => verifyDigestLinkToken('nonsense'))).toBe('malformed');
    expect(reasonOf(() => verifyDigestLinkToken('v2.a.b'))).toBe('malformed');
  });

  it('rejects a top story that is not one of the stories', () => {
    expect(() =>
      issueDigestLinkToken({ m: 'm1', f: 'daily', s: '2026-11-16T09:00:00Z', n: ['a'], l: 'b', p: [] })
    ).not.toThrow();
    const token = issueDigestLinkToken({ m: 'm1', f: 'daily', s: '2026-11-16T09:00:00Z', n: ['a'], l: 'b', p: [] });
    expect(reasonOf(() => verifyDigestLinkToken(token))).toBe('malformed');
  });

  it('fails with no-secret when the secret is not set', () => {
    delete process.env.DIGEST_LINK_SECRET;
    expect(reasonOf(() => verifyDigestLinkToken(VECTOR.token))).toBe('no-secret');
  });
});
