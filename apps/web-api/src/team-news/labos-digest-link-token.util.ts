import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';

/**
 * Signed link from a digest email to the digest page (LAB-3241, LAB-3263).
 *
 * pl-notification-service signs one token per member per digest; this backend only checks it. The token
 * carries the member's own stories in email order, so no per-member copy of the digest is stored.
 *
 * Format, shared with the notification service (keep the two in step; see the fixed vector in the spec):
 *   v1.<base64url JSON payload>.<base64url HMAC-SHA256("v1.<body>", DIGEST_LINK_SECRET)>
 * Short payload keys keep the email URLs short.
 */
export const DIGEST_LINK_PURPOSE = 'digest';

/** 90 days. */
export const DIGEST_LINK_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export const DIGEST_LINK_MAX_STORIES = 20;
export const DIGEST_LINK_MAX_POSTS = 10;

const VERSION = 'v1';

export const DigestLinkPayloadSchema = z
  .object({
    purpose: z.literal(DIGEST_LINK_PURPOSE),
    /** Member uid. */
    m: z.string().min(1),
    /** Frequency. */
    f: z.enum(['daily', 'weekly']),
    /** Send time, ISO 8601. */
    s: z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: 's must be a date' }),
    /** News item uids, in email order. */
    n: z.array(z.string().min(1)).max(DIGEST_LINK_MAX_STORIES),
    /** The top story uid, only when the email showed one. */
    l: z.string().min(1).optional(),
    /** Forum topic ids, in email order. */
    p: z.array(z.number().int().positive()).max(DIGEST_LINK_MAX_POSTS),
    iat: z.number().int(),
  })
  .refine((payload) => payload.l === undefined || payload.n.includes(payload.l), { message: 'l must be in n' });

export type DigestLinkPayload = z.infer<typeof DigestLinkPayloadSchema>;

export type DigestLinkErrorReason = 'no-secret' | 'malformed' | 'signature' | 'purpose' | 'expired';

export class DigestLinkError extends Error {
  constructor(readonly reason: DigestLinkErrorReason) {
    super(`Digest link rejected: ${reason}`);
    this.name = 'DigestLinkError';
  }
}

export const hasDigestLinkSecret = (): boolean => Boolean(process.env.DIGEST_LINK_SECRET);

const getSecret = (): string => {
  const secret = process.env.DIGEST_LINK_SECRET;
  if (!secret) throw new DigestLinkError('no-secret');
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

const sign = (data: string, secret: string): string =>
  base64UrlEncode(createHmac('sha256', secret).update(data).digest());

/**
 * Issues a token. Production tokens come from the notification service; this exists for tests and for
 * minting links against a feature env that runs with a throwaway secret.
 */
export const issueDigestLinkToken = (payload: Omit<DigestLinkPayload, 'purpose' | 'iat'>, now = Date.now()): string => {
  const full: DigestLinkPayload = { purpose: DIGEST_LINK_PURPOSE, ...payload, iat: Math.floor(now / 1000) };
  const body = base64UrlEncode(JSON.stringify(full));
  return `${VERSION}.${body}.${sign(`${VERSION}.${body}`, getSecret())}`;
};

/** Returns the payload, or throws a DigestLinkError whose `reason` says why the token is not acceptable. */
export const verifyDigestLinkToken = (
  token: string,
  maxAgeSeconds = DIGEST_LINK_MAX_AGE_SECONDS,
  now = Date.now()
): DigestLinkPayload => {
  const secret = getSecret();
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts[0] !== VERSION) throw new DigestLinkError('malformed');
  const [version, body, providedSig] = parts;

  const a = Buffer.from(providedSig, 'utf-8');
  const b = Buffer.from(sign(`${version}.${body}`, secret), 'utf-8');
  if (a.length !== b.length || !timingSafeEqual(new Uint8Array(a), new Uint8Array(b))) {
    throw new DigestLinkError('signature');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(base64UrlDecode(body).toString('utf-8'));
  } catch {
    throw new DigestLinkError('malformed');
  }
  if ((decoded as { purpose?: unknown } | null)?.purpose !== DIGEST_LINK_PURPOSE) {
    throw new DigestLinkError('purpose');
  }
  const parsed = DigestLinkPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new DigestLinkError('malformed');

  if (Math.floor(now / 1000) - parsed.data.iat > maxAgeSeconds) throw new DigestLinkError('expired');
  return parsed.data;
};
