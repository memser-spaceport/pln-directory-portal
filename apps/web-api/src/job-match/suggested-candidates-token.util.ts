import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed token for the suggested-candidates email's one-click unsubscribe link (LAB-2850).
 *
 * Same `v1.<base64url json>.<base64url hmac>` format as `job-alerts-token.util.ts`, deliberately not shared
 * with it: a different secret (`SUGGESTED_CANDIDATES_TOKEN_SECRET`) means a job-alerts token fails the
 * signature check here, and the `purpose` field rejects any future token of the same format.
 */
export const SUGGESTED_CANDIDATES_UNSUBSCRIBE_PURPOSE = 'suggested-candidates-unsubscribe';

/** 90 days. */
export const SUGGESTED_CANDIDATES_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export interface SuggestedCandidatesTokenPayload {
  purpose: typeof SUGGESTED_CANDIDATES_UNSUBSCRIBE_PURPOSE;
  memberUid: string;
  iat: number;
}

const VERSION = 'v1';

export const hasSuggestedCandidatesTokenSecret = (): boolean => Boolean(process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET);

const getSecret = (): string => {
  const secret = process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET;
  if (!secret) {
    throw new Error('SUGGESTED_CANDIDATES_TOKEN_SECRET environment variable is not set');
  }
  return secret;
};

const base64UrlEncode = (input: Buffer | string): string => {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (input: string): Buffer => {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
};

const sign = (data: string): string => base64UrlEncode(createHmac('sha256', getSecret()).update(data).digest());

export const issueSuggestedCandidatesUnsubscribeToken = (memberUid: string, now = Date.now()): string => {
  const payload: SuggestedCandidatesTokenPayload = {
    purpose: SUGGESTED_CANDIDATES_UNSUBSCRIBE_PURPOSE,
    memberUid,
    iat: Math.floor(now / 1000),
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${VERSION}.${body}.${sign(`${VERSION}.${body}`)}`;
};

/** Returns the payload, or throws an Error whose message says why the token is not acceptable. */
export const verifySuggestedCandidatesUnsubscribeToken = (
  token: string,
  maxAgeSeconds = SUGGESTED_CANDIDATES_TOKEN_MAX_AGE_SECONDS
): SuggestedCandidatesTokenPayload => {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [version, body, providedSig] = parts;
  if (version !== VERSION) throw new Error('Unsupported token version');

  const expectedSig = sign(`${version}.${body}`);
  const a = Buffer.from(providedSig, 'utf-8');
  const b = Buffer.from(expectedSig, 'utf-8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid token signature');
  }

  let decoded: Partial<SuggestedCandidatesTokenPayload>;
  try {
    decoded = JSON.parse(base64UrlDecode(body).toString('utf-8'));
  } catch {
    throw new Error('Malformed token');
  }
  if (decoded?.purpose !== SUGGESTED_CANDIDATES_UNSUBSCRIBE_PURPOSE) throw new Error('Wrong token purpose');
  if (typeof decoded.memberUid !== 'string' || !decoded.memberUid || typeof decoded.iat !== 'number') {
    throw new Error('Malformed token');
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - decoded.iat;
  if (ageSeconds > maxAgeSeconds) throw new Error('Token expired');

  return decoded as SuggestedCandidatesTokenPayload;
};
