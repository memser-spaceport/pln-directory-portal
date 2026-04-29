import { createHmac, timingSafeEqual } from 'crypto';

export type JobAlertTokenPurpose = 'redirect' | 'unsubscribe';

export interface JobAlertTokenPayload {
  purpose: JobAlertTokenPurpose;
  alertUid: string;
  jobUid?: string;
  applyUrl?: string;
  iat: number;
}

const VERSION = 'v1';

const getSecret = (): string => {
  const secret = process.env.JOB_ALERTS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('JOB_ALERTS_TOKEN_SECRET environment variable is not set');
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

const sign = (data: string): string => {
  return base64UrlEncode(createHmac('sha256', getSecret()).update(data).digest());
};

export const issueJobAlertToken = (payload: Omit<JobAlertTokenPayload, 'iat'>): string => {
  const full: JobAlertTokenPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const body = base64UrlEncode(JSON.stringify(full));
  const signature = sign(`${VERSION}.${body}`);
  return `${VERSION}.${body}.${signature}`;
};

export const verifyJobAlertToken = (
  token: string,
  expectedPurpose: JobAlertTokenPurpose,
  maxAgeSeconds = 60 * 60 * 24 * 60,
): JobAlertTokenPayload => {
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

  const decoded = JSON.parse(base64UrlDecode(body).toString('utf-8')) as JobAlertTokenPayload;
  if (decoded.purpose !== expectedPurpose) throw new Error('Wrong token purpose');

  const ageSeconds = Math.floor(Date.now() / 1000) - decoded.iat;
  if (ageSeconds > maxAgeSeconds) throw new Error('Token expired');

  return decoded;
};
