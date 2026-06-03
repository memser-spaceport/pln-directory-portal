/**
 * Text helpers shared by the corroboration rules, the ScrapingDog comparator,
 * and any new judge rule that needs name tokenization or text similarity.
 */

import { COMPANY_STOPWORDS, MIN_SENTENCE_LENGTH_CHARS, MIN_SUBSTANTIVE_TOKEN_LENGTH } from './constants';

/**
 * Splits a name into substantive tokens (≥3 chars, lowercased, alphanumeric,
 * stopwords like "inc", "labs", "the" dropped). Stopword-aware so generic
 * suffixes don't false-positive cross-team token overlaps.
 */
export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= MIN_SUBSTANTIVE_TOKEN_LENGTH && !COMPANY_STOPWORDS.has(t));
}

/**
 * True when the two names share at least one substantive token. Strong enough
 * to match "Acme Robotics" against "Acme Labs"; stopword-aware enough NOT to
 * match "Acme Labs" against "Beta Labs" via the shared "labs" token.
 */
export function namesShareSubstantiveToken(a: string, b: string): boolean {
  const aToks = new Set(tokenize(a));
  if (aToks.size === 0) return false;
  for (const t of tokenize(b)) if (aToks.has(t)) return true;
  return false;
}

/**
 * Host / handle / slug variant. Two acceptance paths, both strict on placement:
 *
 *   1. **Whole-string prefix**: first dot-separated label STARTS WITH a
 *      substantive team token (`eonsys` ↔ "Eon", `astera.org` ↔ "Astera Institute").
 *   2. **Exact hyphen-segment equality**: any hyphen-separated segment EQUALS
 *      a substantive team token (`the-manifest-network` ↔ "Manifest").
 *
 * Substring-anywhere matching is intentionally never used — it would false-
 * positive on coincidental matches like `beontop.com` for team "Eon".
 */
export function hostFirstLabelMatchesTeamName(teamName: string, host: string): boolean {
  const teamTokens = tokenize(teamName);
  if (teamTokens.length === 0) return false;
  const firstLabel = host.toLowerCase().replace(/^www\./, '').split('.')[0];
  if (!firstLabel || firstLabel.length < MIN_SUBSTANTIVE_TOKEN_LENGTH) return false;
  if (teamTokens.some((t) => firstLabel.startsWith(t))) return true;
  const segments = firstLabel.split('-').filter(Boolean);
  return segments.some((seg) => teamTokens.includes(seg));
}

/** Levenshtein edit distance — used by ScrapingDog tagline overlap. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * True when `a` and `b` match substring-or-within-Levenshtein-ratio. Used for
 * tagline / shortDescription comparison against LinkedIn's tagline (small,
 * one-line text where fuzz tolerance is appropriate).
 */
export function textsOverlap(a: string, b: string, levenshteinRatio: number): boolean {
  const an = a.toLowerCase().replace(/\s+/g, ' ').trim();
  const bn = b.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!an || !bn) return false;
  if (an.includes(bn) || bn.includes(an)) return true;
  const longer = an.length >= bn.length ? an : bn;
  const shorter = an.length >= bn.length ? bn : an;
  const distance = levenshtein(longer, shorter);
  const maxAllowed = Math.ceil(longer.length * levenshteinRatio);
  return distance <= maxAllowed;
}

/**
 * Sentence-level overlap ratio. Used for longer text (longDescription vs
 * LinkedIn `about`) where Levenshtein on the whole blob is too noisy — we
 * split into sentences ≥12 chars and check what fraction of the shorter set
 * is contained in the longer.
 */
export function sentenceOverlap(a: string, b: string, threshold: number): boolean {
  const split = (s: string) =>
    s
      .split(/[.!?]\s+/)
      .map((p) => p.replace(/\s+/g, ' ').trim().toLowerCase())
      .filter((p) => p.length >= MIN_SENTENCE_LENGTH_CHARS);
  const aParts = split(a);
  const bParts = split(b);
  if (aParts.length === 0 || bParts.length === 0) return false;
  const shorter = aParts.length <= bParts.length ? aParts : bParts;
  const longer = aParts.length <= bParts.length ? bParts : aParts;
  const longerText = longer.join(' ');
  const hits = shorter.filter((s) => longerText.includes(s)).length;
  return hits / shorter.length >= threshold;
}

/** Truncation with `...` suffix when over `max`. */
export function truncateString(s: string, max: number): string {
  if (!s) return s;
  if (s.length <= max) return s;
  return max > 3 ? s.substring(0, max - 3) + '...' : s.substring(0, max);
}
