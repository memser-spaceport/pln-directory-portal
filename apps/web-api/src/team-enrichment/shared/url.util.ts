/**
 * URL / host normalization. One canonical implementation that the corroboration
 * rules, ScrapingDog comparator, website probe and judge orchestrator all share.
 */

/**
 * Parses a raw URL (with or without scheme) and returns the lowercased host
 * with `www.` stripped. Returns null when the input is empty or unparseable.
 */
export function normalizeHost(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return u.host.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Accepts subdomain-of relationships: `blog.acme.com` ↔ `acme.com` matches,
 * but `acme.com` ↔ `acmecorp.com` does not.
 */
export function hostsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.endsWith('.' + b) || b.endsWith('.' + a);
}

/** Returns the URL string when it parses to a http(s) URL, null otherwise. */
export function validateHttpUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Returns true when the value parses to a URL (any scheme). */
export function isUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}
