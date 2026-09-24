import { BadRequestException } from '@nestjs/common';

/**
 * Public path patterns: paths of a deployed AI App that its auth sidecar
 * serves to anyone, without LabOS auth. This module is the single source of
 * the pattern rules — the management endpoints and the deploy upload validate
 * with it, and the sidecar's `access-check` decision matches with it.
 *
 * Grammar: a pattern starts with `/`, uses URL path characters plus `*`, and
 * `*` matches any characters including `/`. The first segment is always
 * literal, so no pattern can cover the whole app. Matching is case-sensitive
 * against the percent-decoded request path.
 */

export const AI_APPS_MAX_PUBLIC_PATHS = 20;
export const AI_APPS_MAX_PUBLIC_PATH_LENGTH = 200;

/** Upper bound for a raw request path sent by the sidecar. */
export const AI_APPS_MAX_REQUEST_PATH_LENGTH = 2048;

export interface InvalidPublicPath {
  pattern: string;
  reason: string;
}

const PATTERN_CHARS = /^[A-Za-z0-9\-._~!$&'()+,;=:@/*]*$/;

/** Why a single pattern is invalid, or null when it is valid. */
export function publicPathPatternError(pattern: string): string | null {
  if (!pattern.startsWith('/')) {
    return 'must start with /';
  }
  if (pattern.length > AI_APPS_MAX_PUBLIC_PATH_LENGTH) {
    return `must be at most ${AI_APPS_MAX_PUBLIC_PATH_LENGTH} characters`;
  }
  if (!PATTERN_CHARS.test(pattern)) {
    return "may only contain letters, digits, - . _ ~ ! $ & ' ( ) + , ; = : @ / and *";
  }
  if (pattern.includes('//')) {
    return 'must not contain empty segments (//)';
  }
  const segments = pattern.slice(1).split('/');
  if (!segments[0] || segments[0].includes('*')) {
    return 'the first path segment must be literal (no *), so the whole app cannot be made public';
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return 'must not contain . or .. segments';
  }
  return null;
}

/**
 * Validates a whole list: trims each pattern, collapses duplicates (keeping
 * order), and throws 400 naming every invalid pattern — nothing is saved when
 * any pattern is invalid.
 */
export function assertValidPublicPaths(input: readonly string[]): string[] {
  const publicPaths = Array.from(new Set(input.map((pattern) => pattern.trim())));
  const invalidPatterns: InvalidPublicPath[] = publicPaths.flatMap((pattern) => {
    const reason = publicPathPatternError(pattern);
    return reason ? [{ pattern, reason }] : [];
  });
  if (invalidPatterns.length) {
    // The global exception filter forwards only `message`, so it names every
    // pattern and reason itself; `invalidPatterns` is the structured copy.
    const details = invalidPatterns.map(({ pattern, reason }) => `"${pattern}" ${reason}`).join('; ');
    throw new BadRequestException({ message: `Invalid public path patterns: ${details}`, invalidPatterns });
  }
  if (publicPaths.length > AI_APPS_MAX_PUBLIC_PATHS) {
    throw new BadRequestException({
      message: `An app can have at most ${AI_APPS_MAX_PUBLIC_PATHS} public path patterns`,
      invalidPatterns: [],
    });
  }
  return publicPaths;
}

/** Same patterns in the same order (a missing list counts as empty). */
export function samePublicPaths(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((pattern, index) => pattern === right[index]);
}

/**
 * The request path as it is matched: no query/fragment, percent-decoded once,
 * repeated `/` collapsed. Returns null — never public — for anything that
 * could make the matched path differ from what the app routes: `.`/`..`
 * segments, backslashes, NUL, a malformed escape, or a `%` still present after
 * decoding (double encoding).
 */
export function normalizeRequestPath(raw: string | undefined | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.length > AI_APPS_MAX_REQUEST_PATH_LENGTH) {
    return null;
  }
  const withoutQuery = raw.split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
  if (/[\\\0%]/.test(decoded)) {
    return null;
  }
  const path = decoded.replace(/\/{2,}/g, '/');
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  return path;
}

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`);
}

/** True when the raw request path matches one of the app's valid public patterns. */
export function matchesPublicPath(
  patterns: readonly string[] | null | undefined,
  rawPath: string | undefined | null
): boolean {
  if (!patterns?.length) {
    return false;
  }
  const path = normalizeRequestPath(rawPath);
  if (path === null) {
    return false;
  }
  // Stored patterns were validated on save; re-checking keeps a hand-edited
  // row from ever opening the whole app.
  return patterns.some((pattern) => publicPathPatternError(pattern) === null && patternToRegExp(pattern).test(path));
}
