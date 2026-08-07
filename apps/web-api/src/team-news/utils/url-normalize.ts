/**
 * Canonicalize source URLs for dedup and canonicalKey.
 *
 * Contract (keep in sync with ingest-news.py normalize_source_url):
 * - lowercase host, strip www / fragment / trailing slash
 * - strip tracking query params (utm_*, fbclid, gclid, …)
 * - keep meaningful query params (e.g. YouTube v=)
 * - YouTube / youtu.be → https://youtube.com/watch?v={id}
 * - gov.uk publications → https://{host}/government/publications/{slug}
 */

const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'source',
]);

function isTrackingQueryKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return lowered === 'utm' || lowered.startsWith('utm_') || TRACKING_QUERY_KEYS.has(lowered);
}

function extractYoutubeVideoId(u: URL): string | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id || null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v');
    if (v) return v;

    const parts = u.pathname.split('/').filter(Boolean);
    // /embed/{id} or /shorts/{id} or /live/{id}
    if (parts.length >= 2 && ['embed', 'shorts', 'live'].includes(parts[0])) {
      return parts[1] || null;
    }
  }

  return null;
}

/**
 * Stable publication slug for gov.uk-style paths:
 * /government/publications/{slug}/... → {slug}
 */
export function extractPublicationSlug(input: string): string | null {
  try {
    const u = new URL(input.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!host.endsWith('gov.uk')) return null;

    const match = u.pathname.match(/\/government\/publications\/([^/]+)/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function normalizeSourceUrl(input: string): string {
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');

    const youtubeId = extractYoutubeVideoId(u);
    if (youtubeId) {
      return `https://youtube.com/watch?v=${youtubeId}`;
    }

    const pubSlug = extractPublicationSlug(trimmed);
    if (pubSlug) {
      return `https://${u.hostname}/government/publications/${pubSlug}`;
    }

    const kept: Array<[string, string]> = [];
    u.searchParams.forEach((value, key) => {
      if (!isTrackingQueryKey(key)) {
        kept.push([key, value]);
      }
    });
    kept.sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [key, value] of kept) {
      u.searchParams.append(key, value);
    }

    let pathname = u.pathname.replace(/\/{2,}/g, '/');
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    u.pathname = pathname;

    return u.toString();
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

/** Expand common URL variants for DB lookup before normalize-based filtering. */
export function urlSearchVariants(urls: Iterable<string>): string[] {
  const variants = new Set<string>();

  for (const raw of urls) {
    if (!raw?.trim()) continue;
    const trimmed = raw.trim();
    variants.add(trimmed);

    const normalized = normalizeSourceUrl(trimmed);
    if (normalized) variants.add(normalized);

    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');

      for (const hostname of [host, `www.${host}`]) {
        const clone = new URL(trimmed);
        clone.hostname = hostname;
        variants.add(clone.toString());
        variants.add(normalizeSourceUrl(clone.toString()));
      }

      const youtubeId = extractYoutubeVideoId(u);
      if (youtubeId) {
        variants.add(`https://youtube.com/watch?v=${youtubeId}`);
        variants.add(`https://www.youtube.com/watch?v=${youtubeId}`);
        variants.add(`https://youtu.be/${youtubeId}`);
      }
    } catch {
      // ignore malformed
    }
  }

  return [...variants].filter(Boolean);
}
