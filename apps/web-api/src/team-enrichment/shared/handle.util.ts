/**
 * Handle normalization. One implementation, used by:
 *   - Stage 1.5 contact / social corroboration rules (equality checks).
 *   - The lead-contact collector (founder-cross-reference rule input).
 *   - The field-shape validator (URL → handle extraction before regex check).
 *
 * Accepts every shape the pipeline stores:
 *   - `@handle` → `handle`
 *   - `twitter.com/handle` / `x.com/handle` → `handle`
 *   - `t.me/handle` / `telegram.me/handle` → `handle`
 *   - `linkedin.com/<kind>/<slug>` → `<kind>/<slug>`
 *   - Bare slug → unchanged
 */
export function normalizeHandleValue(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^https?:\/\/(?:www\.)?/i, '');
  v = v.replace(/^(?:twitter|x)\.com\//, '');
  v = v.replace(/^(?:t\.me|telegram\.me)\//, '');
  v = v.replace(/^linkedin\.com\//, '');
  v = v.replace(/^@/, '');
  v = v.replace(/[?#].*$/, '');
  v = v.replace(/\/+$/, '');
  return v || null;
}

/**
 * Strips `urlPrefix` + trailing path/query/fragment from `value` IF it matches.
 * Otherwise returns the value untouched — important because naively stripping
 * `/<rest>` from bare text like "n/a" would yield "n" and spuriously pass
 * downstream handle regexes.
 */
export function extractHandleFromUrlOrPassthrough(value: string, urlPrefix: RegExp): string {
  if (!urlPrefix.test(value)) return value;
  return value
    .replace(urlPrefix, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

/**
 * Normalizes a team-lead LinkedIn value to the on-platform path form
 * (`<kind>/<slug>` or bare slug), plus also stores the bare slug after
 * `company/`, `school/`, or `in/` for looser equality matching.
 */
export function expandLinkedinHandleVariants(raw: string): string[] {
  const norm = raw
    .trim()
    .replace(/^https?:\/\/(?:www\.)?linkedin\.com\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  if (!norm) return [];
  const out = [norm];
  const slugMatch = norm.match(/^(?:company|school|in)\/(.+)$/);
  if (slugMatch) out.push(slugMatch[1]);
  return out;
}

/** Strips `@` and twitter/x URL prefix, returns the bare lowercased handle. */
export function normalizeTwitterHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
}

/** Strips `@` and telegram URL prefix, returns the bare lowercased handle. */
export function normalizeTelegramHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
}
