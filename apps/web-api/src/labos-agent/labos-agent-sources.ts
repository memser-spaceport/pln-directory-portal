import { HuskySourceRef } from 'libs/contracts/src/schema/husky-chat';

/**
 * LabOS web hosts that are not in the env config: production (`os.pl.xyz`), the feature envs
 * (`directory-portal*.os.pl.xyz`, `lab-*.os.pl.xyz`) and the `plnetwork.io` hosts. The same hosts are in
 * `ALLOWED_CORS_ORIGINS` (`apps/web-api/src/utils/constants.ts`). A host here has no `www.`.
 */
const LABOS_HOST_PATTERNS: RegExp[] = [
  /^os\.pl\.xyz$/,
  /^directory-portal[a-z0-9-]*\.os\.pl\.xyz$/,
  /^lab-[a-z0-9-]+\.os\.pl\.xyz$/,
  /^(?:[a-z0-9-]+\.)*plnetwork\.io$/,
];

/** Resolves relative links when the env has no web app URL. It matches no real host. */
const FALLBACK_ORIGIN = 'https://labos.invalid';

/** The web app origin from the existing config (`WEB_UI_BASE_URL`, else `APPLICATION_BASE_URL`), or undefined. */
export function appOrigin(): string | undefined {
  for (const value of [process.env.WEB_UI_BASE_URL, process.env.APPLICATION_BASE_URL]) {
    const url = parseUrl(value?.trim() ?? '');
    if (url) return url.origin;
  }
  return undefined;
}

function parseUrl(value: string, base?: string): URL | undefined {
  if (!value) return undefined;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * One key for one page: the host without `www.`, the path without a trailing slash, and the query. No protocol and
 * no fragment. The query stays, because a LabOS news story is `/?news=<uid>`. A relative link resolves against the
 * web app origin.
 */
export function pageKey(link: string, origin: string = FALLBACK_ORIGIN): string | undefined {
  const url = parseUrl(link.trim(), origin);
  if (!url) return undefined;
  return `${hostOf(url)}${url.pathname.replace(/\/+$/, '')}${url.search}`;
}

/** True for the LabOS web app: the configured origin, and the LabOS host patterns. */
export function isLabosHost(link: string, origin: string = FALLBACK_ORIGIN): boolean {
  const url = parseUrl(link.trim(), origin);
  if (!url) return false;
  const host = hostOf(url);
  return host === hostOf(new URL(origin)) || LABOS_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

/**
 * The C1 `sources` of the agent (LAB-3362 D2). The model writes `sources`, and it often lists the same pages again
 * as `sourceRefs`, or the LabOS site itself. Each kept item is a web page outside LabOS that is not in `sourceRefs`
 * (`externalUrl` or `directoryLink`), and is in the list once. A value that is not an http(s) URL is dropped, as it
 * is not a web page. The order stays.
 */
export function webSources(
  sources: string[],
  sourceRefs: HuskySourceRef[],
  origin: string = appOrigin() ?? FALLBACK_ORIGIN
): string[] {
  const seen = new Set<string>();
  for (const ref of sourceRefs) {
    for (const link of [ref.externalUrl, ref.directoryLink]) {
      const key = link ? pageKey(link, origin) : undefined;
      if (key) seen.add(key);
    }
  }
  const kept: string[] = [];
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    const url = source.trim();
    const key = pageKey(url, origin);
    if (!key || isLabosHost(url, origin) || seen.has(key)) continue;
    seen.add(key);
    kept.push(url);
  }
  return kept;
}
