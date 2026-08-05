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

/**
 * Fetch a page and return og:image / twitter:image, or null on any failure.
 */
export async function fetchOgImageUrl(pageUrl: string): Promise<string | null> {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OG_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(pageUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'PLDirectoryNetworkOverview/1.0',
      },
    });

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
    return extractSocialImageUrl(head, response.url || pageUrl);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
