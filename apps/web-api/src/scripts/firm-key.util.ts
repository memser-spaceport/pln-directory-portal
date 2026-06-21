/**
 * Must match pln-data-enrichment/.../pathfinder/firm-key.util.ts
 */
const STOPWORD_TOKENS = new Set([
  'capital',
  'ventures',
  'venture',
  'partners',
  'fund',
  'funds',
  'management',
  'investments',
  'group',
  'holdings',
  'the',
  'and',
  'co',
  'llc',
  'inc',
  'llp',
  'lp',
  'vc',
  'dao',
]);

export const normalizeFirmName = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function firmKey(name: string | null | undefined): string {
  const tokens = normalizeFirmName(name)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORD_TOKENS.has(t));
  return tokens.length > 0 ? tokens.sort().join(' ') : normalizeFirmName(name);
}

/** Affinity company name → dump summary firmKey when firmKey() alone does not align. */
export const FIRM_KEY_ALIASES: Record<string, string> = {
  'companies cuban mark': 'cuban mark',
};

export function resolveFirmLookupKey(firmName: string): string {
  const key = firmKey(firmName);
  return FIRM_KEY_ALIASES[key] ?? key;
}
