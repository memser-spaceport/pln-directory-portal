export interface InvestorEmailSource {
  primaryEmailAddress?: string | null;
  emailAddresses?: string[] | null;
}

/**
 * Prod dedupe_key form: normalized email (lowercased, trimmed, plus-tag stripped)
 * — matches the enrichment SCHEMA.md convention.
 */
export function normalizeEmailKey(email: string | null | undefined): string {
  const raw = (email ?? '').trim().toLowerCase();
  const at = raw.indexOf('@');
  if (at <= 0 || at === raw.length - 1) return '';
  const local = raw.slice(0, at).split('+')[0];
  if (!local) return '';
  return `${local}@${raw.slice(at + 1)}`;
}

function isPlaceholderEmail(email: string): boolean {
  return email.endsWith('@lp.local');
}

/** All unique normalized roster emails (primary + list), excluding placeholders. */
export function rosterNormalizedEmails(source: InvestorEmailSource): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const candidates = [source.primaryEmailAddress, ...(source.emailAddresses ?? [])];
  for (const raw of candidates) {
    const normalized = normalizeEmailKey(raw);
    if (!normalized || isPlaceholderEmail(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Primary contact: Affinity primary, else first list entry, else ''. */
export function resolvePrimaryEmail(source: InvestorEmailSource): string {
  const primary = normalizeEmailKey(source.primaryEmailAddress);
  if (primary) return primary;
  for (const raw of source.emailAddresses ?? []) {
    const normalized = normalizeEmailKey(raw);
    if (normalized) return normalized;
  }
  return '';
}

/** Secondary emails beyond the stored primary (normalized, deduped, no placeholders). */
export function resolveAdditionalEmails(primary: string, source: InvestorEmailSource): string[] {
  const primaryNorm = normalizeEmailKey(primary);
  return rosterNormalizedEmails(source).filter((e) => e !== primaryNorm);
}

/** Normalize ingest-provided additional emails: dedupe, strip primary and placeholders. */
export function normalizeAdditionalEmails(primary: string, raw: string[]): string[] {
  const primaryNorm = normalizeEmailKey(primary);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const normalized = normalizeEmailKey(item);
    if (!normalized || isPlaceholderEmail(normalized)) continue;
    if (normalized === primaryNorm || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
