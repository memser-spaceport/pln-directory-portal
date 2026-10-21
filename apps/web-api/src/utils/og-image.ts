import { promises as dns } from 'dns';
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

const OG_MAX_HTML_CHARS = 200_000;

/**
 * Page URLs come from member-supplied team posts, so only public https hosts
 * are fetched: no other scheme, no other port, no IP-literal host and no
 * localhost.
 */
export function isAllowedOgPageUrl(pageUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '') {
    return false;
  }
  const host = pageHost(url);
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    return false;
  }
  return isIP(host) === 0;
}

function pageHost(url: URL): string {
  return url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

/** True for loopback, private, link-local, CGNAT, multicast and unspecified addresses. */
export function isNonPublicAddress(address: string): boolean {
  const ip = address.toLowerCase();
  const mappedV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mappedV4) {
    return isNonPublicAddress(mappedV4[1]);
  }
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff');
  }
  return true;
}

// A public host name can still resolve to an internal address.
async function resolvesToPublicAddresses(pageUrl: string): Promise<boolean> {
  try {
    const addresses = await dns.lookup(pageHost(new URL(pageUrl)), { all: true });
    return addresses.length > 0 && addresses.every((entry) => !isNonPublicAddress(entry.address));
  } catch {
    return false;
  }
}

// Read at most OG_MAX_HTML_CHARS of the body: the meta tags are in the head.
async function readHtmlHead(response: Response): Promise<string> {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return (await response.text()).slice(0, OG_MAX_HTML_CHARS);
  }
  const decoder = new TextDecoder();
  let html = '';
  try {
    while (html.length < OG_MAX_HTML_CHARS) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return html.slice(0, OG_MAX_HTML_CHARS);
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
      if (!(await resolvesToPublicAddresses(currentUrl))) {
        return null;
      }
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

      const head = await readHtmlHead(response);
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
