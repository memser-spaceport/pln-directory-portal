import { isIP } from 'net';

/**
 * Extract og:image / twitter:image from HTML and resolve to an absolute URL.
 */
export function extractSocialImageUrl(html: string, pageUrl: string): string | null {
  const og = matchMetaContent(html, 'property', 'og:image') ?? matchMetaContent(html, 'name', 'og:image');
  const twitter =
    matchMetaContent(html, 'name', 'twitter:image') ??
    matchMetaContent(html, 'property', 'twitter:image') ??
    matchMetaContent(html, 'name', 'twitter:image:src');

  const raw = (og || twitter || '').trim();
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw, pageUrl).href;
  } catch {
    return null;
  }
}

function matchMetaContent(html: string, attr: 'property' | 'name', value: string): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${escaped}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

const OG_FETCH_TIMEOUT_MS = 5000;
const OG_MAX_REDIRECTS = 3;
const OG_USER_AGENT = 'PLDirectory/1.0';

/**
 * Page URLs come from member-supplied team posts, so only public https hosts
 * are fetched: no other scheme, no IP-literal host and no localhost.
 */
export function isAllowedOgPageUrl(pageUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    return false;
  }
  return isIP(host) === 0;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fetch a page and return its https og:image / twitter:image, or null on any
 * failure. Redirects are followed by hand so that each hop passes the same
 * host checks as the first URL.
 */
export async function fetchOgImageUrl(pageUrl: string): Promise<string | null> {
  if (!pageUrl || !isAllowedOgPageUrl(pageUrl)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OG_FETCH_TIMEOUT_MS);

  try {
    let currentUrl = pageUrl;
    for (let hop = 0; hop <= OG_MAX_REDIRECTS; hop++) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': OG_USER_AGENT,
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return null;
        }
        const nextUrl = new URL(location, currentUrl).href;
        if (!isAllowedOgPageUrl(nextUrl)) {
          return null;
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('html') && !contentType.includes('xml') && contentType.length > 0) {
        return null;
      }

      const html = await response.text();
      // Only need the head for meta tags; cap size for safety.
      const head = html.slice(0, 200_000);
      const imageUrl = extractSocialImageUrl(head, response.url || currentUrl);
      return imageUrl && isHttpsUrl(imageUrl) ? imageUrl : null;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
