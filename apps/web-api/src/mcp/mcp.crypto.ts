import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateSecret(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('hex')}`;
}

export function pkceS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = pkceS256Challenge(verifier);
  if (computed.length !== challenge.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

export function safeEqualHash(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
