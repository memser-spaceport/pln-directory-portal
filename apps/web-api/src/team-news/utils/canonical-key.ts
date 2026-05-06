import { createHash } from 'crypto';
import { normalizeSourceUrl } from './url-normalize';

/**
 * canonicalKey = sha256(teamUid + normalize(sourceUrl) + ISO date).
 * Idempotent across re-runs: the same article shows up once even if a future
 * run sees a slightly different URL.
 */
export function computeCanonicalKey(teamUid: string, sourceUrl: string, eventDate: Date): string {
  const day = eventDate.toISOString().slice(0, 10);
  const normalized = normalizeSourceUrl(sourceUrl);
  return createHash('sha256').update(`${teamUid}|${normalized}|${day}`).digest('hex');
}
