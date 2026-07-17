/**
 * Lowercase host, drop query/fragment, strip a single trailing slash.
 * Used to compute a stable canonicalKey across re-runs that see slightly
 * different URLs for the same article.
 */
export function normalizeSourceUrl(input: string): string {
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed);
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let result = u.toString();
    if (result.endsWith('/') && u.pathname !== '/') {
      result = result.slice(0, -1);
    }
    return result;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/[#?].*$/, '')
      .replace(/\/+$/, '');
  }
}

export function extractDomain(input: string): string | null {
  try {
    const u = new URL(input.trim());
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}
