/**
 * Shared outbound User-Agent + header set for HTTP fetches the team-enrichment
 * pipeline makes against third-party hosts (team homepages, blog pages, social
 * link discovery). Ported from
 * `pln-data-enrichment/apps/data-enrichment/src/common/utils/user-agent.util.ts`
 * after that project documented a 66% recovery rate on `homepage-unreachable`
 * outcomes once the full browser-like header bouquet was sent.
 *
 * A bare User-Agent is itself a bot signal on modern Cloudflare / Akamai bot
 * rules — they match on the ABSENCE of `Sec-Ch-Ua-*`, `Sec-Fetch-*`,
 * `Accept-Language`, and similar headers a real Chrome navigation ships.
 * Sending the full set keeps website extraction in the long tail of ordinary
 * browser traffic, which is what unblocks the deterministic cross-source
 * corroboration layer downstream (more website signals → more anchors fire →
 * fewer fields reach the AI judge / admin review queue).
 *
 * Update when the advertised Chrome major version drifts more than ~12 months
 * out of date. Keep `BROWSER_USER_AGENT` and the `Sec-Ch-Ua` brand list in
 * sync — a UA/Client-Hints mismatch is itself a fingerprint signal.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export const BROWSER_REQUEST_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'User-Agent': BROWSER_USER_AGENT,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,' +
    'image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-User': '?1',
  'Sec-Fetch-Dest': 'document',
  'Upgrade-Insecure-Requests': '1',
  Priority: 'u=0, i',
});
